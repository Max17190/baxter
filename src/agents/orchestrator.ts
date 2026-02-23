import { generateObject } from "ai";
import { z } from "zod";
import type { QueryComplexity, AgentRole, SynthesizedAnswer, ResearchTask, ResearchPlan } from "../types.js";
import type { ReflectionSummary, ValidationIssue } from "./types.js";
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
    this.deps.bus.emit({ type: "pipeline:status", message: "Classifying query..." });
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
      // Step 2: Run agents in sequence, with special handling for researcher (task graph), analyst (bull/bear), and validator (reflexion)
      for (const agentRole of pipeline) {
        if (agentRole === "researcher" && this.deps.workspace.plan) {
          this.deps.bus.emit({ type: "pipeline:status", message: "Researching..." });
          await this.executeResearchPlan(complexity);
        } else if (agentRole === "analyst" && complexity === "complex" && this.isBullBearEnabled()) {
          this.deps.bus.emit({ type: "pipeline:status", message: "Running bull/bear debate..." });
          await this.runBullBearDebate(complexity);
        } else if (agentRole === "validator") {
          this.deps.bus.emit({ type: "pipeline:status", message: "Validating data..." });
          await this.runValidatorWithReflexion(complexity);
        } else {
          const statusMessages: Record<string, string> = {
            planner: "Planning research...",
            researcher: "Researching...",
            analyst: "Analyzing...",
            synthesizer: "Synthesizing answer...",
          };
          this.deps.bus.emit({ type: "pipeline:status", message: statusMessages[agentRole] ?? `Running ${agentRole}...` });
          const output = await this.runAgent(agentRole, complexity);
          if (agentRole === "analyst" && output.rawOutput) {
            this.deps.workspace.setAnalysis(this.capOutput(output.rawOutput, ANALYST_OUTPUT_CAP));
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

      const waveNum = 10 - maxWaves;
      log.info({ wave: waveNum, tasks: ready.map((t) => t.id) }, "Research wave starting");
      this.deps.bus.emit({ type: "pipeline:status", message: `Research wave ${waveNum} (${ready.length} tasks)...` });

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
   * Run bull and bear analysts in a 2-round iterative debate.
   * Round 1: Independent parallel execution.
   * Round 2: Each analyst sees the opponent's Round 1 output and rebuts.
   */
  private async runBullBearDebate(complexity: QueryComplexity): Promise<void> {
    log.info("Running bull/bear debate (2 rounds)");

    // --- Round 1: Independent parallel execution ---
    this.deps.bus.emit({ type: "pipeline:debate_round", round: 1 });

    const [bullR1Output, bearR1Output] = await Promise.all([
      new AnalystAgent(this.deps, "bull", complexity).run(),
      new AnalystAgent(this.deps, "bear", complexity).run(),
    ]);

    if (bullR1Output.facts.length > 0) this.deps.workspace.addFacts(bullR1Output.facts);
    if (bearR1Output.facts.length > 0) this.deps.workspace.addFacts(bearR1Output.facts);

    const capBullR1 = this.capOutput(bullR1Output.rawOutput, ANALYST_OUTPUT_CAP);
    const capBearR1 = this.capOutput(bearR1Output.rawOutput, ANALYST_OUTPUT_CAP);

    // Store Round 1 for synthesizer context
    this.deps.workspace.setBullAnalysisRound1(capBullR1);
    this.deps.workspace.setBearAnalysisRound1(capBearR1);

    // --- Round 2: Each analyst sees opponent's Round 1, rebuts ---
    this.deps.bus.emit({ type: "pipeline:debate_round", round: 2 });

    const bullR2Context = `\n--- Opponent's Bear Case (Round 1) ---\n${capBearR1}\n\nYou are now in Round 2 of the debate. Acknowledge valid points from the bear case, but strengthen your bull argument with specific rebuttals and additional evidence.`;
    const bearR2Context = `\n--- Opponent's Bull Case (Round 1) ---\n${capBullR1}\n\nYou are now in Round 2 of the debate. Acknowledge valid points from the bull case, but strengthen your bear argument with specific rebuttals and additional evidence.`;

    const [bullR2Output, bearR2Output] = await Promise.all([
      new AnalystAgent(this.deps, "bull", complexity, bullR2Context).run(),
      new AnalystAgent(this.deps, "bear", complexity, bearR2Context).run(),
    ]);

    if (bullR2Output.facts.length > 0) this.deps.workspace.addFacts(bullR2Output.facts);
    if (bearR2Output.facts.length > 0) this.deps.workspace.addFacts(bearR2Output.facts);

    const capBullR2 = this.capOutput(bullR2Output.rawOutput, ANALYST_OUTPUT_CAP);
    const capBearR2 = this.capOutput(bearR2Output.rawOutput, ANALYST_OUTPUT_CAP);

    // Store final round outputs for synthesizer
    if (capBullR2) this.deps.workspace.setBullAnalysis(capBullR2);
    if (capBearR2) this.deps.workspace.setBearAnalysis(capBearR2);

    // Combined analysis includes both rounds
    const combined = `## Bull Case (Round 1)\n${capBullR1}\n\n## Bull Case (Round 2 — Rebuttal)\n${capBullR2}\n\n## Bear Case (Round 1)\n${capBearR1}\n\n## Bear Case (Round 2 — Rebuttal)\n${capBearR2}`;
    this.deps.workspace.setAnalysis(combined);
  }

  private capOutput(raw: string, cap: number): string {
    return raw.length > cap ? raw.slice(0, cap) : raw;
  }

  /** Run a single agent and store its output in the workspace */
  private async runAgent(role: AgentRole, complexity: QueryComplexity) {
    const agent = this.createAgent(role, complexity);
    const output = await agent.run();

    if (output.facts.length > 0) this.deps.workspace.addFacts(output.facts);
    if (output.plan) this.deps.workspace.setPlan(output.plan);
    if (output.answer) this.deps.workspace.setAnswer(output.answer);

    return output;
  }

  /**
   * Run the validator with optional reflexion loop.
   * If the validator finds significant issues and reflexion is enabled,
   * generates a reflection, re-runs affected research tasks + analyst, then re-validates.
   */
  private async runValidatorWithReflexion(complexity: QueryComplexity): Promise<void> {
    const maxRounds = this.getMaxReflexionRounds();
    let reflexionRound = 0;

    while (true) {
      // Check if we should skip validation entirely
      if (this.shouldSkipValidator()) {
        log.info("Skipping validator — fact confidence is uniformly high");
        break;
      }

      // Run validator
      await this.runAgent("validator", complexity);

      // Check if reflexion is needed
      const issues = this.deps.workspace.validationIssues ?? [];
      const dataQualityScore = this.deps.workspace.dataQualityScore ?? 1;
      const hasErrors = issues.some((i) => i.severity === "error");
      const lowQuality = dataQualityScore < 0.7;

      if ((!hasErrors && !lowQuality) || reflexionRound >= maxRounds || !this.isReflexionEnabled()) {
        break; // Quality acceptable, or limits reached
      }

      // Generate reflection
      reflexionRound++;
      const plan = this.deps.workspace.plan;
      if (!plan) break; // No plan = no tasks to re-run

      const reflection = await this.generateReflection(issues, dataQualityScore, plan);
      if (!reflection.shouldReflect || reflection.tasksToRerun.length === 0) {
        break; // LLM decided reflection isn't needed
      }

      // Store reflection and emit events
      const summary: ReflectionSummary = {
        round: reflexionRound,
        issuesAddressed: reflection.affectedFactIds,
        guidance: reflection.guidance,
        tasksToRerun: reflection.tasksToRerun,
      };
      this.deps.workspace.addReflectionSummary(summary);
      this.deps.bus.emit({ type: "pipeline:reflection_start", round: reflexionRound, tasksToRerun: reflection.tasksToRerun });
      log.info({ round: reflexionRound, tasksToRerun: reflection.tasksToRerun }, "Reflexion triggered");

      // Clear old validation before re-run
      this.deps.workspace.clearValidationIssues();

      // Re-run affected research tasks
      await this.executeSelectiveResearch(reflection.tasksToRerun, complexity);

      // Re-run analyst with updated facts + reflection context
      if (this.isBullBearEnabled()) {
        await this.runBullBearDebate(complexity);
      } else {
        const output = await this.runAgent("analyst", complexity);
        if (output.rawOutput) {
          this.deps.workspace.setAnalysis(this.capOutput(output.rawOutput, ANALYST_OUTPUT_CAP));
        }
      }

      const durationMs = Math.round(performance.now());
      this.deps.bus.emit({ type: "pipeline:reflection_complete", round: reflexionRound, durationMs });

      // Loop back to validator
    }
  }

  /**
   * Generate a reflection summary from validation issues using the fast model.
   * Decides which research tasks should be re-run.
   */
  private async generateReflection(
    issues: readonly ValidationIssue[],
    dataQualityScore: number,
    plan: ResearchPlan,
  ): Promise<{ shouldReflect: boolean; guidance: string; tasksToRerun: string[]; affectedFactIds: string[] }> {
    const reflectionSchema = z.object({
      shouldReflect: z.boolean().describe("Whether issues are severe enough to warrant re-research"),
      guidance: z.string().describe("Specific instructions for re-running research and analysis"),
      affectedTaskIds: z.array(z.string()).describe("Research task IDs that should be re-run"),
      affectedFactIds: z.array(z.string()).describe("Fact IDs that have issues"),
    });

    const result = await generateObject({
      model: this.deps.router.fast,
      schema: reflectionSchema,
      system: `You are evaluating validation results to decide if research should be re-run.
Given validation issues and the original research plan, determine:
1. Whether the issues are severe enough to warrant re-research
2. Which specific research tasks should be re-run to address the issues
3. Concrete guidance for the re-run agents on what to fix or look for`,
      prompt: `Validation Issues:\n${JSON.stringify(issues, null, 2)}\n\nData Quality Score: ${dataQualityScore}\n\nResearch Plan Tasks:\n${JSON.stringify(plan.tasks.map((t) => ({ id: t.id, description: t.description })), null, 2)}`,
    });

    if (result.usage) {
      const { provider, model } = parseModelId(this.deps.router.fastModelName);
      this.deps.tokenTracker.record(provider, model, result.usage.promptTokens, result.usage.completionTokens);
    }

    return {
      shouldReflect: result.object.shouldReflect,
      guidance: result.object.guidance,
      tasksToRerun: result.object.affectedTaskIds,
      affectedFactIds: result.object.affectedFactIds,
    };
  }

  /**
   * Re-execute only specific research tasks identified by the reflection.
   * Resets their status to pending and runs them through the wave executor.
   */
  private async executeSelectiveResearch(taskIds: string[], complexity: QueryComplexity): Promise<void> {
    const plan = this.deps.workspace.plan;
    if (!plan) return;

    for (const task of plan.tasks) {
      if (taskIds.includes(task.id)) {
        task.status = "pending";
        task.result = undefined;
      }
    }

    await this.executeResearchPlan(complexity);
  }

  /** Check if reflexion is enabled via config */
  private isReflexionEnabled(): boolean {
    try {
      return loadConfig().reflexionEnabled;
    } catch {
      return true;
    }
  }

  /** Get max reflexion rounds from config */
  private getMaxReflexionRounds(): number {
    try {
      return loadConfig().maxReflexionRounds;
    } catch {
      return 1;
    }
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
