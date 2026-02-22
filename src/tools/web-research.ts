import { z } from "zod";
import { defineTool } from "./types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("web-research");

const parameters = z.object({
  query: z.string().describe(
    "Search query or URL. If it starts with http:// or https://, the page will be scraped. Otherwise, a web search is performed and top results returned with content.",
  ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Number of search results to return (default 5, max 10). Ignored for URL scraping."),
});

/**
 * Creates the unified web_research tool.
 * Internally routes between search and scrape based on input.
 * Only registered when a Firecrawl API key is available.
 */
export function createWebResearchTool() {
  return defineTool({
    name: "web_research",
    description:
      "Search the web or scrape a specific URL. Pass a search query to find relevant pages with content, or pass a full URL (https://...) to extract its content as markdown. Use for news, earnings calls, analyst opinions, and qualitative research.",
    parameters,
    category: "firecrawl",
    execute: async (params) => {
      const start = performance.now();
      try {
        // Lazy import to avoid loading Firecrawl when not needed
        const { getFirecrawlClient, firecrawlBreaker } = await import("./firecrawl/client.js");

        const isUrl = params.query.startsWith("http://") || params.query.startsWith("https://");

        if (isUrl) {
          // Scrape mode
          log.debug({ url: params.query }, "Scraping URL");
          const response = await firecrawlBreaker.execute(async () => {
            const client = getFirecrawlClient();
            return client.scrapeUrl(params.query, { formats: ["markdown"] });
          });

          const durationMs = Math.round(performance.now() - start);
          if (!response.success) {
            return { toolName: "web_research", success: false, error: response.error ?? "Scrape failed", durationMs };
          }
          return { toolName: "web_research", success: true, data: response, durationMs };
        }

        // Search mode
        log.debug({ query: params.query, limit: params.limit }, "Web search");
        const response = await firecrawlBreaker.execute(async () => {
          const client = getFirecrawlClient();
          return client.search(params.query, { limit: params.limit ?? 5 });
        });

        const durationMs = Math.round(performance.now() - start);
        if (!response.success) {
          return { toolName: "web_research", success: false, error: response.error ?? "Search failed", durationMs };
        }
        return { toolName: "web_research", success: true, data: response.data, durationMs };
      } catch (error) {
        return {
          toolName: "web_research",
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Math.round(performance.now() - start),
        };
      }
    },
  });
}
