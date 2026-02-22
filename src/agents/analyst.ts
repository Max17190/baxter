import { BaseAgent, type BaseAgentDeps } from "./base-agent.js";
import type { AgentOutput } from "./types.js";
import { extractFactsWithLLM } from "./fact-extractor.js";

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

You also have access to financial data tools if you need additional data points.

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

export class AnalystAgent extends BaseAgent {
  private perspective: AnalystPerspective;

  constructor(deps: BaseAgentDeps, perspective: AnalystPerspective = "neutral") {
    const allTools = deps.toolRegistry.names;
    const systemPrompt = SYSTEM_PROMPT + PERSPECTIVE_PROMPTS[perspective];

    super(
      {
        role: "analyst",
        modelTier: "primary",
        systemPrompt,
        tools: allTools,
        maxSteps: 8,
      },
      deps,
    );

    this.perspective = perspective;
  }

  protected async processResult(text: string): Promise<Partial<AgentOutput>> {
    const tags = ["analysis"];
    if (this.perspective !== "neutral") tags.push(this.perspective);

    const facts = await extractFactsWithLLM(text, this.deps.router.fast, "analyst", tags);
    this.deps.workspace.addFacts(facts);
    this.deps.workspace.setAnalysis(text);

    return { facts };
  }
}
