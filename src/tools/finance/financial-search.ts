import { z } from "zod";
import { defineTool } from "../types.js";
import { getFinancialClient } from "./client.js";

const parameters = z.object({
  query: z
    .string()
    .describe(
      "Natural language search query (e.g. 'companies with revenue growth over 20%')",
    ),
  ticker: z
    .string()
    .optional()
    .describe("Optional ticker to scope the search to a specific company"),
});

interface FinancialSearchResponse {
  results: unknown[];
}

export const searchFinancialData = defineTool({
  name: "search_financial_data",
  description:
    "Search financial data using natural language queries. Can search across companies or be scoped to a specific ticker. Useful for screening and discovery.",
  parameters,
  category: "finance",
  execute: async (params) => {
    const start = performance.now();
    try {
      const client = getFinancialClient();
      const queryParams: Record<string, string> = {
        query: params.query,
      };
      if (params.ticker) {
        queryParams.ticker = params.ticker.toUpperCase();
      }

      const data = await client.get<FinancialSearchResponse>(
        "/search",
        queryParams,
      );

      return {
        toolName: "search_financial_data",
        success: true,
        data: data.results,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "search_financial_data",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
