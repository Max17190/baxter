import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent, type BaseAgentDeps } from "./base-agent.js";
import type { AgentOutput } from "./types.js";
import type { SynthesizedAnswer, Citation, AnswerTable } from "../types.js";
import { parseModelId } from "../config.js";
import { startAgentSpan, endSpan, endSpanWithError } from "../observability/tracer.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("agent");

const answerSchema = z.object({
  content: z.string().describe("The complete answer in markdown format"),
  citations: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      url: z.string().optional(),
    }),
  ),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).optional(),
  tables: z
    .array(
      z.object({
        title: z.string().describe("Table title"),
        columns: z.array(z.string()).describe("Column headers"),
        rows: z.array(z.array(z.string())).describe("Row data, each row is an array of cell values"),
      }),
    )
    .optional()
    .describe("Structured data tables for financial comparisons, metrics, etc. Use when presenting tabular data."),
});

const SYSTEM_PROMPT = `You are a financial research synthesizer. Your job is to take gathered facts, analysis, and validation results and produce a clear, comprehensive answer.

Guidelines:
- Write in a professional but accessible tone
- Use markdown formatting: headers, bullet points, tables where appropriate
- Always cite your sources using [1], [2] notation
- Include a confidence level (0-1) for the overall answer
- If there are validation issues or conflicting data, mention them as warnings
- Structure longer answers with clear sections
- Include specific numbers, dates, and data points
- If the data is insufficient to fully answer the question, say so clearly
- When presenting financial comparisons, metrics breakdowns, or multi-company data, structure them as tables using the "tables" field
- Tables should have clear column headers and clean cell values (include units like $, %, x)

Format your answer as a well-structured markdown document.`;

export class SynthesizerAgent extends BaseAgent {
  constructor(deps: BaseAgentDeps) {
    super(
      {
        role: "synthesizer",
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
      const context = this.deps.workspace.buildContextFor("synthesizer");

      const result = await generateObject({
        model: this.model,
        schema: answerSchema,
        system: SYSTEM_PROMPT,
        prompt: context,
      });

      if (result.usage) {
        const { provider, model } = parseModelId(this.modelName);
        this.deps.tokenTracker.record(provider, model, result.usage.promptTokens, result.usage.completionTokens);
      }

      const citations: Citation[] = result.object.citations.map((c) => ({
        ...c,
        accessedAt: Date.now(),
      }));

      const tables: AnswerTable[] | undefined = result.object.tables?.map((t) => ({
        title: t.title,
        columns: t.columns,
        rows: t.rows,
      }));

      const answer: SynthesizedAnswer = {
        content: result.object.content,
        citations,
        confidence: result.object.confidence,
        factsUsed: this.deps.workspace.facts.map((f) => f.id),
        warnings: result.object.warnings,
        tables,
      };

      this.deps.workspace.setAnswer(answer);

      const durationMs = Math.round(performance.now() - start);
      log.info({ role, durationMs }, "Agent completed");
      endSpan(span, { "agent.duration_ms": durationMs });
      this.deps.bus.emit({ type: "agent:complete", agent: role, durationMs });

      return { role, facts: [], rawOutput: result.object.content, answer, durationMs };
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error({ role, durationMs, error: errorMsg }, "Agent failed");
      endSpanWithError(span, error instanceof Error ? error : new Error(errorMsg));
      this.deps.bus.emit({ type: "agent:error", agent: role, error: errorMsg });
      return { role, facts: [], rawOutput: "", durationMs };
    }
  }

  // Required by BaseAgent but never called since we override run()
  protected async processResult(): Promise<Partial<AgentOutput>> {
    return {};
  }
}
