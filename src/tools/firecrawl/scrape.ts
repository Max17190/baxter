import { z } from "zod";
import { defineTool } from "../types.js";
import { getFirecrawlClient, firecrawlBreaker } from "./client.js";

const scrapeParams = z.object({
  url: z.string().url().describe("The URL to scrape"),
  formats: z
    .array(z.enum(["markdown", "html", "links"]))
    .optional()
    .describe("Output formats to return (default: [\"markdown\"])"),
});

export const firecrawlScrape = defineTool({
  name: "firecrawl_scrape",
  description: "Scrape a single URL and extract its content as markdown",
  parameters: scrapeParams,
  category: "firecrawl",
  execute: async (params) => {
    const start = performance.now();
    try {
      const response = await firecrawlBreaker.execute(async () => {
        const client = getFirecrawlClient();
        return client.scrapeUrl(params.url, { formats: params.formats ?? ["markdown"] });
      });

      const durationMs = Math.round(performance.now() - start);

      if (!response.success) {
        return {
          toolName: "firecrawl_scrape",
          success: false,
          error: response.error ?? "Scrape request failed",
          durationMs,
        };
      }

      return {
        toolName: "firecrawl_scrape",
        success: true,
        data: response,
        durationMs,
      };
    } catch (error) {
      return {
        toolName: "firecrawl_scrape",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
