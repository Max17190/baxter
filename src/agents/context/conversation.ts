import { generateObject } from "ai";
import { z } from "zod";
import type { LanguageModelV1 } from "ai";
import type { Fact } from "../../types.js";

interface ConversationTurn {
  query: string;
  answerSummary: string;
  facts: Fact[];
  timestamp: number;
}

const rewriteSchema = z.object({
  rewrittenQuery: z.string().describe("The fully resolved query with all references expanded"),
  isFollowUp: z.boolean().describe("Whether this query references prior conversation context"),
});

/**
 * Manages multi-turn conversation context.
 * Stores recent turns and resolves follow-up queries using the fast model.
 */
export class Conversation {
  private turns: ConversationTurn[] = [];
  private maxTurns = 10;

  addTurn(query: string, answerSummary: string, facts: Fact[]): void {
    this.turns.push({ query, answerSummary, facts, timestamp: Date.now() });
    if (this.turns.length > this.maxTurns) {
      this.turns.shift();
    }
  }

  /**
   * Resolve ambiguous follow-up queries using conversation context.
   * e.g., "What about their margins?" → "What are AAPL's margins?"
   */
  async resolveFollowUp(query: string, fastModel: LanguageModelV1): Promise<string> {
    if (this.turns.length === 0) return query;

    try {
      const context = this.turns
        .slice(-3) // Last 3 turns for context
        .map((t) => `Q: ${t.query}\nA: ${t.answerSummary}`)
        .join("\n\n");

      const result = await generateObject({
        model: fastModel,
        schema: rewriteSchema,
        system: `You resolve ambiguous follow-up queries by expanding references using conversation history.
If the query is already self-contained, return it unchanged and set isFollowUp to false.
If it references prior context (e.g., "their", "that company", "what about margins"), rewrite it to be fully self-contained.

Examples:
- Prior: "Analyze AAPL" → Current: "What about their margins?" → "What are AAPL's profit margins?"
- Prior: "Compare MSFT and GOOG" → Current: "Which has better growth?" → "Which has better growth, MSFT or GOOG?"
- "What is TSLA's PE ratio?" → "What is TSLA's PE ratio?" (already self-contained)`,
        prompt: `Conversation history:\n${context}\n\nNew query: ${query}`,
      });

      if (result.object.isFollowUp) {
        return result.object.rewrittenQuery;
      }
      return query;
    } catch {
      return query; // On failure, use original query
    }
  }

  /** Build context string for workspace seeding */
  buildContext(): string {
    if (this.turns.length === 0) return "";

    const parts = this.turns.slice(-3).map(
      (t) => `[Previous Query] ${t.query}\n[Answer Summary] ${t.answerSummary}`,
    );

    return parts.join("\n\n");
  }

  get turnCount(): number {
    return this.turns.length;
  }
}
