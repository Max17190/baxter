import { BaseAgent, type BaseAgentDeps } from "./base-agent.js";
import type { AgentOutput } from "./types.js";
import type { QueryComplexity, ResearchTask } from "../types.js";
import type { ToolSourceInfo } from "../tools/registry.js";
import { extractFactsWithLLM } from "./fact-extractor.js";

const SYSTEM_PROMPT = `You are a financial research agent. Your job is to gather data and facts using the available tools.

Guidelines:
- Use financial data tools to get quantitative data (income statements, balance sheets, prices, metrics)
- Use web research tools when you need qualitative information (news, earnings calls, analyst opinions)
- Gather more data than you think is needed — better to over-research than under-research
- For each piece of data you find, note the source clearly
- If a tool call fails, try an alternative approach
- Focus on factual data gathering, not analysis — that's for the analyst agent

When you're done, summarize all the facts you found in a structured format.`;

const RESEARCHER_MAX_STEPS: Record<QueryComplexity, number> = {
  simple: 3,
  medium: 6,
  complex: 10,
};

export class ResearcherAgent extends BaseAgent {
  private task?: ResearchTask;

  constructor(deps: BaseAgentDeps, task?: ResearchTask, complexity?: QueryComplexity) {
    // Get all available tool names, or narrow to task-specified tools
    const allTools = task?.tools?.length ? task.tools : deps.toolRegistry.names;
    const systemPrompt = task
      ? `${SYSTEM_PROMPT}\n\nYour specific task: ${task.description}\nFocus on using these tools: ${task.tools.join(", ")}`
      : SYSTEM_PROMPT;

    const maxSteps = RESEARCHER_MAX_STEPS[complexity ?? deps.workspace.complexity ?? "complex"];

    super(
      {
        role: "researcher",
        modelTier: "fast",
        systemPrompt,
        tools: allTools,
        maxSteps,
      },
      deps,
    );

    this.task = task;
  }

  protected async processResult(
    text: string,
    _fullResult: unknown,
    toolSources?: Array<{ toolName: string } & ToolSourceInfo>,
  ): Promise<Partial<AgentOutput>> {
    const facts = await extractFactsWithLLM(text, this.deps.router.fast, "researcher", ["research"], toolSources);
    // Don't write to workspace here — the orchestrator handles workspace writes
    // from the returned output. This prevents double-writes and race conditions.
    return { facts };
  }
}
