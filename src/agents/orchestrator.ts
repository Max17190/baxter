import { generateObject } from "ai";
import { z } from "zod";
import type { QueryComplexity, AgentRole, SynthesizedAnswer } from "../types.js";
import type { BaseAgentDeps } from "./base-agent.js";
import { ResearcherAgent } from "./researcher.js";
import { SynthesizerAgent } from "./synthesizer.js";
import { PlannerAgent } from "./planner.js";
import { AnalystAgent } from "./analyst.js";
import { ValidatorAgent } from "./validator.js";
import { parseModelId } from "../config.js";

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

    // Step 1: Classify query complexity using fast model
    const classification = await this.classifyQuery(query);
    this.deps.workspace.setComplexity(classification.complexity);

    const pipeline = PIPELINE_ROUTES[classification.complexity];

    this.deps.bus.emit({
      type: "pipeline:start",
      complexity: classification.complexity,
      agents: pipeline,
    });

    try {
      // Step 2: Run agents in sequence
      for (const agentRole of pipeline) {
        const agent = this.createAgent(agentRole);
        const output = await agent.run();

        // Store results in workspace
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

      const answer = this.deps.workspace.answer;
      if (!answer) {
        throw new Error("Pipeline completed but no answer was generated");
      }

      const durationMs = Math.round(performance.now() - start);
      this.deps.bus.emit({ type: "pipeline:complete", durationMs, answer });

      return answer;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.deps.bus.emit({ type: "pipeline:error", error: errorMsg });
      throw error;
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
