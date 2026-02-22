import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent, type BaseAgentDeps } from "./base-agent.js";
import type { AgentOutput } from "./types.js";
import type { ResearchPlan } from "../types.js";
import { parseModelId } from "../config.js";

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

Available tool categories:
- Finance tools: get_income_statements, get_balance_sheets, get_cash_flows, get_prices, get_key_metrics, get_sec_filings, get_insider_trades, get_institutional_holdings, get_analyst_estimates, get_segmented_financials, search_financial_data
- Web tools: firecrawl_search, firecrawl_scrape, firecrawl_extract, firecrawl_agent
- Calculation tools: calculate_financial_ratios, calculate_growth_rates, calculate_statistics, calculate_dcf

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

  protected async processResult(): Promise<Partial<AgentOutput>> {
    const context = this.deps.workspace.buildContextFor("planner");

    const result = await generateObject({
      model: this.model,
      schema: researchPlanSchema,
      system: SYSTEM_PROMPT,
      prompt: context,
    });

    if (result.usage) {
      const { provider, model } = parseModelId(this.modelName);
      this.deps.tokenTracker.record(
        provider,
        model,
        result.usage.promptTokens,
        result.usage.completionTokens,
      );
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
    return { plan };
  }
}
