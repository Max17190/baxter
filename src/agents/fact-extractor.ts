import { generateObject } from "ai";
import { z } from "zod";
import { randomUUIDv7 } from "bun";
import type { LanguageModelV1 } from "ai";
import type { Fact, AgentRole } from "../types.js";

const factExtractionSchema = z.object({
  facts: z.array(
    z.object({
      content: z.string().describe("An atomic, verifiable claim with specific data points"),
      confidence: z.number().min(0).max(1).describe("How confident are you in this fact (0-1)"),
      tags: z.array(z.string()).describe("Categorization tags (e.g., revenue, margin, growth, valuation, risk)"),
      source: z.string().optional().describe("Where this fact came from (tool name or reasoning)"),
    }),
  ),
});

const SYSTEM_PROMPT = `Extract atomic, verifiable facts from the following text. Each fact should:
- Be a single, specific claim (not a compound statement)
- Include concrete data points (numbers, dates, percentages) when available
- Be attributable to a source if mentioned
- Have an appropriate confidence level:
  - 0.9-1.0: Hard numbers from financial statements or APIs
  - 0.7-0.9: Derived calculations or well-sourced claims
  - 0.5-0.7: Qualitative assessments or estimates
  - Below 0.5: Speculative or unverified

Do NOT include:
- Vague or generic statements without specific data
- Meta-commentary about the research process
- Duplicate or near-duplicate facts`;

/**
 * LLM-based fact extraction — replaces regex-based splitting.
 * Uses the fast model to extract structured facts from agent output text.
 */
export async function extractFactsWithLLM(
  text: string,
  model: LanguageModelV1,
  agentRole: AgentRole,
  defaultTags: string[] = [],
): Promise<Fact[]> {
  if (!text || text.trim().length < 30) return [];

  try {
    const result = await generateObject({
      model,
      schema: factExtractionSchema,
      system: SYSTEM_PROMPT,
      prompt: text,
    });

    return result.object.facts.map((f) => ({
      id: randomUUIDv7(),
      content: f.content,
      provenance: {
        agent: agentRole,
        tool: f.source,
        timestamp: Date.now(),
      },
      confidence: f.confidence,
      tags: [...new Set([...defaultTags, ...f.tags])],
    }));
  } catch {
    // Fallback to simple line splitting if LLM extraction fails
    return fallbackExtract(text, agentRole, defaultTags);
  }
}

function fallbackExtract(text: string, agentRole: AgentRole, tags: string[]): Fact[] {
  const lines = text.split("\n").filter((line) => line.trim().length > 20);
  return lines.slice(0, 20).map((line) => ({
    id: randomUUIDv7(),
    content: line.replace(/^[-*•#]\s*/, "").trim(),
    provenance: { agent: agentRole, timestamp: Date.now() },
    confidence: 0.7,
    tags,
  }));
}
