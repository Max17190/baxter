import { BaseAgent, type BaseAgentDeps } from "./base-agent.js";
import type { AgentOutput } from "./types.js";

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

export class AnalystAgent extends BaseAgent {
  constructor(deps: BaseAgentDeps) {
    const allTools = deps.toolRegistry.names;

    super(
      {
        role: "analyst",
        modelTier: "primary",
        systemPrompt: SYSTEM_PROMPT,
        tools: allTools,
        maxSteps: 8,
      },
      deps,
    );
  }

  protected async processResult(text: string): Promise<Partial<AgentOutput>> {
    // Extract facts from the analysis
    const facts = this.extractAnalysisFacts(text);
    this.deps.workspace.addFacts(facts);
    this.deps.workspace.setAnalysis(text);

    return { facts };
  }

  private extractAnalysisFacts(text: string) {
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    const facts = [];

    for (const line of lines) {
      const trimmed = line.replace(/^[-*•#]\s*/, "").trim();
      // Look for lines with numbers (likely quantitative findings)
      if (trimmed.length > 20 && /\d/.test(trimmed)) {
        facts.push(
          this.createFact(trimmed, {
            confidence: 0.85,
            tags: ["analysis"],
          }),
        );
      }
    }

    return facts;
  }
}
