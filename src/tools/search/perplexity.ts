import type { SearchBackend, SearchResult } from "./types.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("perplexity-search");

export function createPerplexityBackend(apiKey: string): SearchBackend {
  return {
    name: "perplexity",
    async search(query: string, _limit: number): Promise<SearchResult[]> {
      log.debug({ query }, "Perplexity search");

      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          max_tokens: 4096,
          messages: [
            { role: "system", content: "You are a helpful research assistant. Provide factual, detailed answers." },
            { role: "user", content: query },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as PerplexityResponse;
      const answerText = data.choices?.[0]?.message?.content ?? "";
      const citations: string[] = data.citations ?? [];

      // Return the answer as a single result with cited URLs
      const results: SearchResult[] = [{
        url: "perplexity://answer",
        title: "Perplexity Answer",
        content: answerText,
      }];

      // Add citation URLs as additional results
      for (const url of citations) {
        results.push({
          url,
          title: url,
          content: "",
        });
      }

      return results;
    },
  };
}

interface PerplexityResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  citations?: string[];
}
