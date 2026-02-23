import Exa from "exa-js";
import type { SearchBackend, SearchResult } from "./types.js";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("exa-search");

export function createExaBackend(apiKey: string): SearchBackend {
  const client = new Exa(apiKey);

  return {
    name: "exa",
    async search(query: string, limit: number): Promise<SearchResult[]> {
      log.debug({ query, limit }, "Exa search");
      const response = await client.searchAndContents(query, {
        numResults: limit,
        text: true,
      });

      return response.results.map((r) => ({
        url: r.url,
        title: r.title ?? "",
        content: r.text ?? "",
      }));
    },
  };
}
