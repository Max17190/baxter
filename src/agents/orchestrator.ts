import { generateObject } from "ai";
import { z } from "zod";
import type { QueryComplexity, AgentRole, SynthesizedAnswer, ResearchTask } from "../types.js";
import type { BaseAgentDeps } from "./base-agent.js";
import { ResearcherAgent } from "./researcher.js";
import { SynthesizerAgent } from "./synthesizer.js";
import { PlannerAgent } from "./planner.js";
import { AnalystAgent, type AnalystPerspective } from "./analyst.js";
import { ValidatorAgent } from "./validator.js";
import { parseModelId } from "../config.js";
import { createChildLogger } from "../utils/logger.js";
import { startPipelineSpan, endSpan, endSpanWithError } from "../observability/tracer.js";

const log = createChildLogger("orchestrator");

const PIPELINE_ROUTES: Record<QueryComplexity, AgentRole[]> = {
  simple: ["researcher", "synthesizer"],
  medium: ["planner", "researcher", "analyst", "synthesizer"],
  complex: ["planner", "researcher", "analyst", "validator", "synthesizer"],
};

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
    this.deps.workspace.setComplexity(classification.complexity);
    log.info({ complexity: classification.complexity, reasoning: classification.reasoning, suggestedTools: classification.suggestedTools }, "Query classified");

    // Step 1b: Match skills
    if (this.deps.skillRegistry) {
      const matched = this.deps.skillRegistry.match(query);
      if (matched) {
        this.deps.workspace.setMatchedSkill(matched);
        this.deps.bus.emit({ type: "pipeline:skill_matched", skill: matched.name });
        log.info({ skill: matched.name }, "Skill matched");
      }
    }

    const pipeline = PIPELINE_ROUTES[classification.complexity];
    pipelineSpan = startPipelineSpan(query, classification.complexity);

    this.deps.bus.emit({
      type: "pipeline:start",
      complexity: classification.complexity,
      agents: pipeline,
    });

    try {
      // Step 2: Run agents in sequence, with special handling for researcher (task graph) and analyst (bull/bear)
      for (const agentRole of pipeline) {
        if (agentRole === "researcher" && this.deps.workspace.plan) {
          // Use task graph execution when a plan exists
          await this.executeResearchPlan();
        } else if (agentRole === "analyst" && classification.complexity === "complex") {
          // Run bull/bear debate for complex queries
          await this.runBullBearDebate();
        } else {
          const agent = this.createAgent(agentRole);
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
            this.deps.workspace.setAnalysis(output.rawOutput);
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

  /**
   * Execute the research plan using dependency-based waves.
   * Tasks whose dependencies are all completed run in parallel within each wave.
   */
  private async executeResearchPlan(): Promise<void> {
    const plan = this.deps.workspace.plan;
    if (!plan) return;

    const tasks = plan.tasks;
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // Process waves until all tasks are completed or failed
    let maxWaves = 10;
    while (maxWaves-- > 0) {
      // Find tasks ready to run: pending + all dependencies completed
      const ready = tasks.filter(
        (t) =>
          t.status === "pending" &&
          t.dependencies.every((depId) => {
            const dep = taskMap.get(depId);
            return dep?.status === "completed";
          }),
      );

      if (ready.length === 0) break; // No more tasks can run

      log.info({ wave: 10 - maxWaves, tasks: ready.map((t) => t.id) }, "Research wave starting");

      // Run all ready tasks in parallel
      const results = await Promise.allSettled(
        ready.map(async (task) => {
          task.status = "in_progress";
          const researcher = new ResearcherAgent(this.deps, task);
          const output = await researcher.run();

          if (output.facts.length > 0) {
            this.deps.workspace.addFacts(output.facts);
          }

          task.status = "completed";
          task.result = output.rawOutput;
          return output;
        }),
      );

      // Mark failed tasks
      for (let i = 0; i < results.length; i++) {
        if (results[i].status === "rejected") {
          ready[i].status = "failed";
          log.warn({ taskId: ready[i].id }, "Research task failed");
        }
      }

      // Check if all tasks are done
      if (tasks.every((t) => t.status === "completed" || t.status === "failed")) break;
    }
  }

  /**
   * Run bull and bear analysts in parallel for complex queries.
   */
  private async runBullBearDebate(): Promise<void> {
    log.info("Running bull/bear debate");

    const [bullOutput, bearOutput] = await Promise.all([
      new AnalystAgent(this.deps, "bull").run(),
      new AnalystAgent(this.deps, "bear").run(),
    ]);

    if (bullOutput.facts.length > 0) this.deps.workspace.addFacts(bullOutput.facts);
    if (bearOutput.facts.length > 0) this.deps.workspace.addFacts(bearOutput.facts);

    // Store both perspectives for the synthesizer
    if (bullOutput.rawOutput) this.deps.workspace.setBullAnalysis(bullOutput.rawOutput);
    if (bearOutput.rawOutput) this.deps.workspace.setBearAnalysis(bearOutput.rawOutput);

    // Also set the combined analysis
    const combined = `## Bull Case\n${bullOutput.rawOutput}\n\n## Bear Case\n${bearOutput.rawOutput}`;
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

  private createAgent(role: AgentRole) {
    switch (role) {
      case "planner":
        return new PlannerAgent(this.deps);
      case "researcher":
        return new ResearcherAgent(this.deps);
      case "analyst":
        return new AnalystAgent(this.deps);
      case "validator":
        return new ValidatorAgent(this.deps);
      case "synthesizer":
        return new SynthesizerAgent(this.deps);
      default:
        throw new Error(`Unknown agent role: ${role}`);
    }
  }
}
