import type { SearchBackend, SearchResult } from "./types.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("tavily-search");

export function createTavilyBackend(apiKey: string): SearchBackend {
  return {
    name: "tavily",
    async search(query: string, limit: number): Promise<SearchResult[]> {
      log.debug({ query, limit }, "Tavily search");

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: limit,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as TavilyResponse;

      return (data.results ?? []).map((r) => ({
        url: r.url ?? "",
        title: r.title ?? "",
        content: r.content ?? "",
      }));
    },
  };
}

interface TavilyResponse {
  results?: Array<{
    url?: string;
    title?: string;
    content?: string;
  }>;
}
