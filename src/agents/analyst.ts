import { BaseAgent, type BaseAgentDeps } from "./base-agent.js";
import type { AgentOutput } from "./types.js";
import type { QueryComplexity } from "../types.js";
import { extractFactsWithLLM } from "./fact-extractor.js";

const CALCULATION_TOOLS = [
  "calculate_financial_ratios",
  "calculate_growth_rates",
  "calculate_statistics",
  "calculate_dcf",
];

const SYSTEM_PROMPT = `You are a financial analyst agent. Your job is to analyze gathered research data and produce insights.

Guidelines:
- Use calculation tools to compute financial ratios, growth rates, and valuations
- Compare metrics against industry benchmarks and historical trends
- Identify key strengths, weaknesses, opportunities, and threats
- Flag any anomalies or concerning trends in the data
- Provide quantitative support for every conclusion
- Structure your analysis with clear sections

Available calculation tools:
- calculate_financial_ratios: Compute PE, PB, ROE, ROA, margins, etc.
- calculate_growth_rates: Compute CAGR, YoY growth, sequential growth
- calculate_statistics: Compute mean, median, standard deviation
- calculate_dcf: Run discounted cash flow valuation

Analyze the research facts provided in your context using calculation tools. The research phase already gathered all relevant data — do not attempt to fetch new data.

Output a structured analysis with clear sections and quantitative evidence.`;

export type AnalystPerspective = "neutral" | "bull" | "bear";

const PERSPECTIVE_PROMPTS: Record<AnalystPerspective, string> = {
  neutral: "",
  bull: `\n\nIMPORTANT: You are arguing the BULL CASE. Focus on:
- Growth catalysts and competitive advantages
- Upside potential and positive trends
- Why the market may be undervaluing this company
- Optimistic but data-supported projections
Be persuasive but honest — back every claim with data.`,
  bear: `\n\nIMPORTANT: You are arguing the BEAR CASE. Focus on:
- Risks, threats, and competitive weaknesses
- Downside potential and negative trends
- Why the market may be overvaluing this company
- Conservative or cautious projections
Be persuasive but honest — back every claim with data.`,
};

const ANALYST_MAX_STEPS: Record<QueryComplexity, number> = {
  simple: 5,
  medium: 5,
  complex: 8,
};

export class AnalystAgent extends BaseAgent {
  private perspective: AnalystPerspective;

  constructor(deps: BaseAgentDeps, perspective: AnalystPerspective = "neutral", complexity?: QueryComplexity) {
    const systemPrompt = SYSTEM_PROMPT + PERSPECTIVE_PROMPTS[perspective];
    const maxSteps = ANALYST_MAX_STEPS[complexity ?? deps.workspace.complexity ?? "complex"];

    super(
      {
        role: "analyst",
        modelTier: "primary",
        systemPrompt,
        tools: CALCULATION_TOOLS,
        maxSteps,
      },
      deps,
    );

    this.perspective = perspective;
  }

  protected async processResult(text: string): Promise<Partial<AgentOutput>> {
    const tags = ["analysis"];
    if (this.perspective !== "neutral") tags.push(this.perspective);

    const facts = await extractFactsWithLLM(text, this.deps.router.fast, "analyst", tags);
    // Don't write to workspace here — the orchestrator handles workspace writes
    // from the returned output. This prevents race conditions in bull/bear parallel execution.
    return { facts };
  }
}
