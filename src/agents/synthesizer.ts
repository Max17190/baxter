import { generateObject, streamObject } from "ai";
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
      number: z.number().optional().describe("Citation number matching the [N] notation used in content"),
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
- Always cite your sources using [N] notation matching the Citation Index numbers provided in your context
- In the citations array, include the number, source description, and URL from the Citation Index
- Include a confidence level (0-1) for the overall answer
- If there are validation issues or conflicting data, mention them as warnings
- Structure longer answers with clear sections
- Include specific numbers, dates, and data points
- If the data is insufficient to fully answer the question, say so clearly
- When presenting financial comparisons, metrics breakdowns, or multi-company data, structure them as tables using the "tables" field
- Tables should have clear column headers and clean cell values (include units like $, %, x)

Format your answer as a well-structured markdown document.`;

/** Minimum interval between streaming chunk emissions (ms) */
const STREAM_THROTTLE_MS = 50;

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

  /** Override run() — uses streamObject for progressive output, falls back to generateObject */
  async run(): Promise<AgentOutput> {
    const start = performance.now();
    const role = this.config.role;
    const span = startAgentSpan(role, this.deps.workspace.query);

    log.info({ role, model: this.modelName }, "Agent starting");
    this.deps.bus.emit({ type: "agent:start", agent: role, query: this.deps.workspace.query });

    try {
      const context = this.deps.workspace.buildContextFor("synthesizer");

      // Try streaming first, fall back to generateObject on failure
      let finalObject: z.infer<typeof answerSchema>;
      let usage: { promptTokens: number; completionTokens: number } | undefined;

      try {
        const result = await this.runStreaming(context);
        finalObject = result.object;
        usage = result.usage;
      } catch (streamError) {
        log.warn({ error: streamError instanceof Error ? streamError.message : String(streamError) }, "Streaming failed, falling back to generateObject");
        const result = await generateObject({
          model: this.model,
          schema: answerSchema,
          system: SYSTEM_PROMPT,
          prompt: context,
        });
        finalObject = result.object;
        usage = result.usage;
      }

      if (usage) {
        const { provider, model } = parseModelId(this.modelName);
        this.deps.tokenTracker.record(provider, model, usage.promptTokens, usage.completionTokens);
      }

      // Build citation index for number assignment
      const citationIndex = this.deps.workspace.buildCitationIndex();
      const citationUrlMap = new Map<number, string>();
      for (const entry of citationIndex) {
        if (entry.sourceUrl) citationUrlMap.set(entry.number, entry.sourceUrl);
      }

      const citations: Citation[] = finalObject.citations.map((c) => ({
        ...c,
        // Use URL from citation index if the LLM didn't provide one
        url: c.url || (c.number ? citationUrlMap.get(c.number) : undefined),
        accessedAt: Date.now(),
      }));

      const tables: AnswerTable[] | undefined = finalObject.tables?.map((t) => ({
        title: t.title,
        columns: t.columns,
        rows: t.rows,
      }));

      const answer: SynthesizedAnswer = {
        content: finalObject.content,
        citations,
        confidence: finalObject.confidence,
        factsUsed: this.deps.workspace.facts.map((f) => f.id),
        warnings: finalObject.warnings,
        tables,
      };

      this.deps.workspace.setAnswer(answer);

      // Emit final done chunk
      this.deps.bus.emit({ type: "synthesizer:chunk", content: finalObject.content, done: true });

      const durationMs = Math.round(performance.now() - start);
      log.info({ role, durationMs }, "Agent completed");
      endSpan(span, { "agent.duration_ms": durationMs });
      this.deps.bus.emit({ type: "agent:complete", agent: role, durationMs });

      return { role, facts: [], rawOutput: finalObject.content, answer, durationMs };
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error({ role, durationMs, error: errorMsg }, "Agent failed");
      endSpanWithError(span, error instanceof Error ? error : new Error(errorMsg));
      this.deps.bus.emit({ type: "agent:error", agent: role, error: errorMsg });
      return { role, facts: [], rawOutput: "", durationMs };
    }
  }

  /** Run streamObject and emit progressive chunks */
  private async runStreaming(context: string): Promise<{
    object: z.infer<typeof answerSchema>;
    usage?: { promptTokens: number; completionTokens: number };
  }> {
    const stream = streamObject({
      model: this.model,
      schema: answerSchema,
      system: SYSTEM_PROMPT,
      prompt: context,
    });

    let lastEmitTime = 0;
    let lastContent = "";

    for await (const partial of stream.partialObjectStream) {
      const now = performance.now();
      const content = partial.content ?? "";

      // Throttle emissions to avoid render thrash
      if (content !== lastContent && now - lastEmitTime >= STREAM_THROTTLE_MS) {
        this.deps.bus.emit({ type: "synthesizer:chunk", content, done: false });
        lastEmitTime = now;
        lastContent = content;
      }
    }

    const finalObject = await stream.object;
    const usage = await stream.usage;

    return {
      object: finalObject,
      usage: usage ? { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens } : undefined,
    };
  }

  // Required by BaseAgent but never called since we override run()
  protected async processResult(): Promise<Partial<AgentOutput>> {
    return {};
  }
}
