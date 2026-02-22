import { z } from "zod";
import { defineTool } from "../types.js";
import { getFirecrawlClient, firecrawlBreaker } from "./client.js";

const crawlParams = z.object({
  url: z.string().url().describe("The starting URL to crawl"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of pages to crawl (default 10)"),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Maximum crawl depth from the starting URL (default 2)"),
});

export const firecrawlCrawl = defineTool({
  name: "firecrawl_crawl",
  description: "Crawl a website starting from a URL",
  parameters: crawlParams,
  category: "firecrawl",
  execute: async (params) => {
    const start = performance.now();
    try {
      const response = await firecrawlBreaker.execute(async () => {
        const client = getFirecrawlClient();
        return client.crawlUrl(params.url, { limit: params.limit ?? 10, maxDepth: params.maxDepth ?? 2 });
      });

      const durationMs = Math.round(performance.now() - start);

      if (!response.success) {
        return {
          toolName: "firecrawl_crawl",
          success: false,
          error: response.error ?? "Crawl request failed",
          durationMs,
        };
      }

      return {
        toolName: "firecrawl_crawl",
        success: true,
        data: response.data,
        durationMs,
      };
    } catch (error) {
      return {
        toolName: "firecrawl_crawl",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
