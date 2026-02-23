import { generateObject } from "ai";
import { z } from "zod";
import type { QueryComplexity, AgentRole, SynthesizedAnswer, ResearchTask } from "../types.js";
import type { BaseAgentDeps } from "./base-agent.js";
import { ResearcherAgent } from "./researcher.js";
import { SynthesizerAgent } from "./synthesizer.js";
import { PlannerAgent } from "./planner.js";
import { AnalystAgent, type AnalystPerspective } from "./analyst.js";
import { ValidatorAgent } from "./validator.js";
import { parseModelId, loadConfig } from "../config.js";
import { createChildLogger } from "../utils/logger.js";
import { startPipelineSpan, endSpan, endSpanWithError } from "../observability/tracer.js";

const log = createChildLogger("orchestrator");

const PIPELINE_ROUTES: Record<QueryComplexity, AgentRole[]> = {
  simple: ["researcher", "synthesizer"],
  medium: ["planner", "researcher", "analyst", "synthesizer"],
  complex: ["planner", "researcher", "analyst", "validator", "synthesizer"],
};

/** Max chars to keep from researcher rawOutput when storing task results */
const RESEARCHER_OUTPUT_CAP = 2000;
/** Max chars to keep from analyst rawOutput when storing analysis */
const ANALYST_OUTPUT_CAP = 3000;

const classificationSchema = z.object({
  complexity: z.enum(["simple", "medium", "complex"]),
  reasoning: z.string(),
  suggestedTools: z.array(z.string()),
});

/**
 * Orchestrator: classifies query complexity and routes through the appropriate pipeline.
 * Uses the fast model for classification, then coordinates agent execution.
 */
export class Orchestrator {
  private deps: BaseAgentDeps;

  constructor(deps: BaseAgentDeps) {
    this.deps = deps;
  }

  async run(): Promise<SynthesizedAnswer> {
    const start = performance.now();
    const query = this.deps.workspace.query;
    let pipelineSpan: ReturnType<typeof startPipelineSpan> | undefined;

    // Step 1: Classify query complexity using fast model
    const classification = await this.classifyQuery(query);
    const complexity = classification.complexity;
    this.deps.workspace.setComplexity(complexity);
    log.info({ complexity, reasoning: classification.reasoning, suggestedTools: classification.suggestedTools }, "Query classified");

    // Step 1b: Match skills
    if (this.deps.skillRegistry) {
      const matched = this.deps.skillRegistry.match(query);
      if (matched) {
        this.deps.workspace.setMatchedSkill(matched);
        this.deps.bus.emit({ type: "pipeline:skill_matched", skill: matched.name });
        log.info({ skill: matched.name }, "Skill matched");
      }
    }

    const pipeline = PIPELINE_ROUTES[complexity];
    pipelineSpan = startPipelineSpan(query, complexity);

    this.deps.bus.emit({
      type: "pipeline:start",
      complexity,
      agents: pipeline,
    });

    try {
      // Step 2: Run agents in sequence, with special handling for researcher (task graph) and analyst (bull/bear)
      for (const agentRole of pipeline) {
        if (agentRole === "researcher" && this.deps.workspace.plan) {
          await this.executeResearchPlan(complexity);
        } else if (agentRole === "analyst" && complexity === "complex" && this.isBullBearEnabled()) {
          await this.runBullBearDebate(complexity);
        } else if (agentRole === "validator" && this.shouldSkipValidator()) {
          log.info("Skipping validator — fact confidence is uniformly high");
        } else {
          const agent = this.createAgent(agentRole, complexity);
          const output = await agent.run();

          if (output.facts.length > 0) {
            this.deps.workspace.addFacts(output.facts);
          }
          if (output.plan) {
            this.deps.workspace.setPlan(output.plan);
          }
          if (output.answer) {
            this.deps.workspace.setAnswer(output.answer);
          }
          if (agentRole === "analyst" && output.rawOutput) {
            this.deps.workspace.setAnalysis(
              output.rawOutput.length > ANALYST_OUTPUT_CAP
                ? output.rawOutput.slice(0, ANALYST_OUTPUT_CAP)
                : output.rawOutput,
            );
          }
        }
      }

      const answer = this.deps.workspace.answer;
      if (!answer) {
        throw new Error("Pipeline completed but no answer was generated");
      }

      const durationMs = Math.round(performance.now() - start);
      if (pipelineSpan) endSpan(pipelineSpan, { "pipeline.duration_ms": durationMs, "pipeline.facts": this.deps.workspace.facts.length });
      this.deps.bus.emit({ type: "pipeline:complete", durationMs, answer });

      return answer;
    } catch (error) {
      if (pipelineSpan) endSpanWithError(pipelineSpan, error instanceof Error ? error : new Error(String(error)));
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.deps.bus.emit({ type: "pipeline:error", error: errorMsg });
      throw error;
    }
  }

  /** Check if bull/bear debate is enabled via config */
  private isBullBearEnabled(): boolean {
    try {
      return loadConfig().bullBearEnabled;
    } catch {
      return false;
    }
  }

  /**
   * Confidence-based validator skip.
   * Returns true if we should skip the validator (all facts are high confidence).
   */
  private shouldSkipValidator(): boolean {
    const facts = this.deps.workspace.facts;
    if (facts.length === 0) return false;

    const avgConfidence = facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length;
    const hasLowConfidence = facts.some((f) => f.confidence < 0.6);

    return avgConfidence >= 0.85 && !hasLowConfidence;
  }

  /**
   * Execute the research plan using dependency-based waves.
   * Tasks whose dependencies are all completed run in parallel within each wave.
   */
  private async executeResearchPlan(complexity: QueryComplexity): Promise<void> {
    const plan = this.deps.workspace.plan;
    if (!plan) return;

    const tasks = plan.tasks;
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // Detect circular dependencies before starting
    const hasCycle = this.detectCycle(tasks);
    if (hasCycle) {
      log.warn("Circular dependency detected in research plan — executing tasks sequentially without dependency checks");
      // Strip all dependencies to allow sequential execution
      for (const task of tasks) task.dependencies = [];
    }

    // Process waves until all tasks are completed or failed
    let maxWaves = 10;
    while (maxWaves-- > 0) {
      // Find tasks ready to run: pending + all dependencies completed or failed
      const ready = tasks.filter(
        (t) =>
          t.status === "pending" &&
          t.dependencies.every((depId) => {
            const dep = taskMap.get(depId);
            // Allow tasks to proceed if dependency completed OR failed (with warning)
            return !dep || dep.status === "completed" || dep.status === "failed";
          }),
      );

      if (ready.length === 0) break;

      log.info({ wave: 10 - maxWaves, tasks: ready.map((t) => t.id) }, "Research wave starting");

      const results = await Promise.allSettled(
        ready.map(async (task) => {
          task.status = "in_progress";
          const researcher = new ResearcherAgent(this.deps, task, complexity);
          const output = await researcher.run();

          if (output.facts.length > 0) {
            this.deps.workspace.addFacts(output.facts);
          }

          task.status = "completed";
          // Compress output on handoff — downstream agents use structured facts, not raw text
          task.result = output.rawOutput.length > RESEARCHER_OUTPUT_CAP
            ? output.rawOutput.slice(0, RESEARCHER_OUTPUT_CAP)
            : output.rawOutput;
          return output;
        }),
      );

      for (let i = 0; i < results.length; i++) {
        if (results[i].status === "rejected") {
          ready[i].status = "failed";
          log.warn({ taskId: ready[i].id }, "Research task failed");
        }
      }

      if (tasks.every((t) => t.status === "completed" || t.status === "failed")) break;
    }

    // Log any tasks that never ran
    const stuck = tasks.filter((t) => t.status === "pending");
    if (stuck.length > 0) {
      log.warn({ stuckTasks: stuck.map((t) => t.id) }, "Research tasks could not be executed");
    }
  }

  /** Simple cycle detection using DFS */
  private detectCycle(tasks: ResearchTask[]): boolean {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const dfs = (id: string): boolean => {
      if (inStack.has(id)) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      inStack.add(id);
      const task = taskMap.get(id);
      if (task) {
        for (const dep of task.dependencies) {
          if (dfs(dep)) return true;
        }
      }
      inStack.delete(id);
      return false;
    };

    return tasks.some((t) => dfs(t.id));
  }

  /**
   * Run bull and bear analysts in parallel for complex queries.
   */
  private async runBullBearDebate(complexity: QueryComplexity): Promise<void> {
    log.info("Running bull/bear debate");

    const [bullOutput, bearOutput] = await Promise.all([
      new AnalystAgent(this.deps, "bull", complexity).run(),
      new AnalystAgent(this.deps, "bear", complexity).run(),
    ]);

    if (bullOutput.facts.length > 0) this.deps.workspace.addFacts(bullOutput.facts);
    if (bearOutput.facts.length > 0) this.deps.workspace.addFacts(bearOutput.facts);

    // Store both perspectives for the synthesizer (with output compression)
    const capBull = bullOutput.rawOutput.length > ANALYST_OUTPUT_CAP
      ? bullOutput.rawOutput.slice(0, ANALYST_OUTPUT_CAP)
      : bullOutput.rawOutput;
    const capBear = bearOutput.rawOutput.length > ANALYST_OUTPUT_CAP
      ? bearOutput.rawOutput.slice(0, ANALYST_OUTPUT_CAP)
      : bearOutput.rawOutput;

    if (capBull) this.deps.workspace.setBullAnalysis(capBull);
    if (capBear) this.deps.workspace.setBearAnalysis(capBear);

    // Also set the combined analysis
    const combined = `## Bull Case\n${capBull}\n\n## Bear Case\n${capBear}`;
    this.deps.workspace.setAnalysis(combined);
  }

  private async classifyQuery(query: string) {
    const result = await generateObject({
      model: this.deps.router.fast,
      schema: classificationSchema,
      system: `You classify financial research queries by complexity.

- simple: Single data point or straightforward lookup (e.g., "What is AAPL's PE ratio?", "What's the current price of TSLA?")
- medium: Requires multiple data points and some analysis (e.g., "Compare AAPL and MSFT margins", "How has NVDA revenue grown?")
- complex: Requires deep research, multi-step analysis, or synthesis from many sources (e.g., "Is NVDA overvalued? Do a DCF.", "What are the risks of investing in TSLA?")

Also suggest which tools would be helpful. Available tool categories: finance (financial data API), firecrawl (web research), calculation (local math).`,
      prompt: query,
    });

    // Track token usage
    if (result.usage) {
      const { provider, model } = parseModelId(this.deps.router.fastModelName);
      this.deps.tokenTracker.record(
        provider,
        model,
        result.usage.promptTokens,
        result.usage.completionTokens,
      );
    }

    return result.object;
  }

  private createAgent(role: AgentRole, complexity?: QueryComplexity) {
    switch (role) {
      case "planner":
        return new PlannerAgent(this.deps);
      case "researcher":
        return new ResearcherAgent(this.deps, undefined, complexity);
      case "analyst":
        return new AnalystAgent(this.deps, "neutral", complexity);
      case "validator":
        return new ValidatorAgent(this.deps);
      case "synthesizer":
        return new SynthesizerAgent(this.deps);
      default:
        throw new Error(`Unknown agent role: ${role}`);
    }
  }
}
