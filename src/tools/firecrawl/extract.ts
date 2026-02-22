import { z } from "zod";
import { defineTool } from "../types.js";
import { getFirecrawlClient } from "./client.js";

const extractParams = z.object({
  urls: z
    .array(z.string().url())
    .min(1)
    .describe("URLs to extract structured data from"),
  prompt: z
    .string()
    .describe("Extraction prompt describing what data to extract"),
});

export const firecrawlExtract = defineTool({
  name: "firecrawl_extract",
  description: "Extract structured data from URLs using a prompt",
  parameters: extractParams,
  category: "firecrawl",
  execute: async (params) => {
    const start = performance.now();
    try {
      const client = getFirecrawlClient();
      const response = await client.extract(params.urls, {
        prompt: params.prompt,
      });

      const durationMs = Math.round(performance.now() - start);

      if (!response.success) {
        return {
          toolName: "firecrawl_extract",
          success: false,
          error: response.error ?? "Extract request failed",
          durationMs,
        };
      }

      return {
        toolName: "firecrawl_extract",
        success: true,
        data: response.data,
        durationMs,
      };
    } catch (error) {
      return {
        toolName: "firecrawl_extract",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
