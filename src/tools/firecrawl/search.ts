import { z } from "zod";
import { defineTool } from "../types.js";
import { getFirecrawlClient, firecrawlBreaker } from "./client.js";

const searchParams = z.object({
  query: z.string().describe("Search query string"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Maximum number of results to return (default 5)"),
});

export const firecrawlSearch = defineTool({
  name: "firecrawl_search",
  description: "Search the web and return relevant results with content",
  parameters: searchParams,
  category: "firecrawl",
  execute: async (params) => {
    const start = performance.now();
    try {
      const result = await firecrawlBreaker.execute(async () => {
        const client = getFirecrawlClient();
        return client.search(params.query, { limit: params.limit ?? 5 });
      });

      const durationMs = Math.round(performance.now() - start);

      if (!result.success) {
        return {
          toolName: "firecrawl_search",
          success: false,
          error: result.error ?? "Search request failed",
          durationMs,
        };
      }

      return {
        toolName: "firecrawl_search",
        success: true,
        data: result.data,
        durationMs,
      };
    } catch (error) {
      return {
        toolName: "firecrawl_search",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
