import { BaseAgent, type BaseAgentDeps } from "./base-agent.js";
import type { AgentOutput } from "./types.js";

const SYSTEM_PROMPT = `You are a financial research agent. Your job is to gather data and facts using the available tools.

Guidelines:
- Use financial data tools to get quantitative data (income statements, balance sheets, prices, metrics)
- Use web research tools when you need qualitative information (news, earnings calls, analyst opinions)
- Gather more data than you think is needed — better to over-research than under-research
- For each piece of data you find, note the source clearly
- If a tool call fails, try an alternative approach
- Focus on factual data gathering, not analysis — that's for the analyst agent

When you're done, summarize all the facts you found in a structured format.`;

export class ResearcherAgent extends BaseAgent {
  constructor(deps: BaseAgentDeps) {
    // Get all available tool names
    const allTools = deps.toolRegistry.names;

    super(
      {
        role: "researcher",
        modelTier: "fast",
        systemPrompt: SYSTEM_PROMPT,
        tools: allTools,
        maxSteps: 10,
      },
      deps,
    );
  }

  protected async processResult(text: string): Promise<Partial<AgentOutput>> {
    // Parse the researcher's output into facts
    const facts = this.extractFacts(text);
    this.deps.workspace.addFacts(facts);

    return { facts };
  }

  private extractFacts(text: string) {
    // Split the text into meaningful chunks and create facts
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    const facts = [];

    for (const line of lines) {
      const trimmed = line.replace(/^[-*•]\s*/, "").trim();
      if (trimmed.length > 20) {
        // Only meaningful content
        facts.push(
          this.createFact(trimmed, {
            confidence: 0.8,
            tags: ["research"],
          }),
        );
      }
    }

    return facts;
  }
}
