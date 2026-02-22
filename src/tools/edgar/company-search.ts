import { z } from "zod";
import { defineTool } from "../types.js";
import { getEdgarClient } from "./client.js";

const params = z.object({
  query: z.string().describe("Company name, ticker, or CIK to search for"),
  forms: z
    .array(z.string())
    .optional()
    .describe("Filter by form types (e.g., ['10-K', '10-Q', '8-K'])"),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const edgarSearchCompany = defineTool({
  name: "edgar_search_company",
  description:
    "Search SEC EDGAR for companies and their filings. Free — no API key needed. Returns filing metadata including company names, CIKs, and recent filing information.",
  parameters: params,
  category: "edgar",
  execute: async (params) => {
    const start = performance.now();
    try {
      const client = getEdgarClient();
      const data = await client.search(params.query, {
        forms: params.forms,
        limit: params.limit,
      });

      return {
        toolName: "edgar_search_company",
        success: true,
        data,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "edgar_search_company",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
