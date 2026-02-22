import { z } from "zod";
import { defineTool } from "../types.js";
import { getFirecrawlClient } from "./client.js";

const agentParams = z.object({
  query: z
    .string()
    .describe("Research query for the autonomous web research agent"),
});

export const firecrawlAgent = defineTool({
  name: "firecrawl_agent",
  description:
    "Use Firecrawl's AI agent for autonomous multi-step web research",
  parameters: agentParams,
  category: "firecrawl",
  execute: async (params) => {
    const start = performance.now();
    try {
      const client = getFirecrawlClient();

      // Attempt to use Firecrawl's dedicated agent endpoint if available,
      // otherwise fall back to a broad search with result processing.
      let data: unknown;

      if (typeof (client as unknown as Record<string, unknown>).agent === "function") {
        // Firecrawl agent mode is available
        const response = await (
          client as unknown as {
            agent: (
              query: string,
              options?: Record<string, unknown>,
            ) => Promise<{ success: boolean; data?: unknown; error?: string }>;
          }
        ).agent(params.query);

        const durationMs = Math.round(performance.now() - start);

        if (!response.success) {
          return {
            toolName: "firecrawl_agent",
            success: false,
            error: response.error ?? "Agent request failed",
            durationMs,
          };
        }

        data = response.data;
      } else {
        // Fallback: use search with a broader limit and aggregate results
        const searchResponse = await client.search(params.query, { limit: 5 });

        if (!searchResponse.success) {
          const durationMs = Math.round(performance.now() - start);
          return {
            toolName: "firecrawl_agent",
            success: false,
            error:
              searchResponse.error ??
              "Agent fallback search failed",
            durationMs,
          };
        }

        // Aggregate search results into a structured research summary
        const results = searchResponse.data ?? [];
        data = {
          mode: "search_fallback",
          query: params.query,
          resultsCount: results.length,
          results: results.map(
            (r: { url?: string; title?: string; markdown?: string; description?: string }) => ({
              url: r.url,
              title: r.title,
              content: r.markdown ?? r.description ?? null,
            }),
          ),
        };
      }

      return {
        toolName: "firecrawl_agent",
        success: true,
        data,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "firecrawl_agent",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
