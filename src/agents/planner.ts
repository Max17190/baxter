import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent, type BaseAgentDeps } from "./base-agent.js";
import type { AgentOutput } from "./types.js";
import type { ResearchPlan } from "../types.js";
import { parseModelId } from "../config.js";
import { startAgentSpan, endSpan, endSpanWithError } from "../observability/tracer.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("agent");

const researchPlanSchema = z.object({
  objective: z.string().describe("Clear statement of the research objective"),
  tasks: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      tools: z.array(z.string()).describe("Tool names to use for this task"),
      dependencies: z.array(z.string()).describe("IDs of tasks that must complete first"),
    }),
  ),
  estimatedComplexity: z.enum(["simple", "medium", "complex"]),
});

const SYSTEM_PROMPT = `You are a financial research planner. Your job is to decompose complex financial queries into a structured research plan.

Guidelines:
- Break the query into discrete, actionable research tasks
- Each task should specify which tools to use
- Identify dependencies between tasks (what needs to happen first)
- Tasks that can run in parallel should have no dependencies on each other
- Be specific about what data to gather (e.g., "Get AAPL income statements for last 5 years" not just "Get financial data")

Available tools:
- financial_data: Get any financial data (income statements, balance sheets, cash flows, prices, metrics, SEC filings, insider trades, analyst estimates, segment data). Just describe what data you need.
- web_research: Search the web or scrape a URL for news, earnings calls, analyst opinions
- calculate_financial_ratios: Compute PE, PB, ROE, ROA, margins, liquidity, leverage ratios
- calculate_growth_rates: Compute CAGR, YoY growth, sequential growth
- calculate_statistics: Compute mean, median, standard deviation, percentiles
- calculate_dcf: Run discounted cash flow valuation

Structure the plan so independent data gathering happens first, then analysis tasks that depend on gathered data.`;

export class PlannerAgent extends BaseAgent {
  constructor(deps: BaseAgentDeps) {
    super(
      {
        role: "planner",
        modelTier: "primary",
        systemPrompt: SYSTEM_PROMPT,
        maxSteps: 1,
      },
      deps,
    );
  }

  /** Override run() to go straight to generateObject — avoids wasteful generateText call */
  async run(): Promise<AgentOutput> {
    const start = performance.now();
    const role = this.config.role;
    const span = startAgentSpan(role, this.deps.workspace.query);

    log.info({ role, model: this.modelName }, "Agent starting");
    this.deps.bus.emit({ type: "agent:start", agent: role, query: this.deps.workspace.query });

    try {
      const context = this.deps.workspace.buildContextFor("planner");

      const result = await generateObject({
        model: this.model,
        schema: researchPlanSchema,
        system: SYSTEM_PROMPT,
        prompt: context,
      });

      if (result.usage) {
        const { provider, model } = parseModelId(this.modelName);
        this.deps.tokenTracker.record(provider, model, result.usage.promptTokens, result.usage.completionTokens);
      }

      const plan: ResearchPlan = {
        objective: result.object.objective,
        tasks: result.object.tasks.map((t) => ({
          ...t,
          status: "pending" as const,
        })),
        estimatedComplexity: result.object.estimatedComplexity,
      };

      this.deps.workspace.setPlan(plan);

      const durationMs = Math.round(performance.now() - start);
      log.info({ role, durationMs, tasks: plan.tasks.length }, "Agent completed");
      endSpan(span, { "agent.duration_ms": durationMs });
      this.deps.bus.emit({ type: "agent:complete", agent: role, durationMs });

      return { role, facts: [], rawOutput: plan.objective, plan, durationMs };
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error({ role, durationMs, error: errorMsg }, "Agent failed");
      endSpanWithError(span, error instanceof Error ? error : new Error(errorMsg));
      this.deps.bus.emit({ type: "agent:error", agent: role, error: errorMsg });
      return { role, facts: [], rawOutput: "", durationMs };
    }
  }

  protected async processResult(): Promise<Partial<AgentOutput>> {
    return {};
  }
}
