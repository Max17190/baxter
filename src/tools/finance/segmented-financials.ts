import { z } from "zod";
import { defineTool } from "../types.js";
import { getFinancialClient } from "./client.js";

const parameters = z.object({
  ticker: z.string().describe("Stock ticker symbol (e.g. AAPL, MSFT)"),
  period: z
    .enum(["annual", "quarterly"])
    .describe("Reporting period: annual or quarterly"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(5)
    .describe("Number of records to return (default 5, max 100)"),
});

interface SegmentedFinancialsResponse {
  segmented_financials: unknown[];
}

export const getSegmentedFinancials = defineTool({
  name: "get_segmented_financials",
  description:
    "Retrieve segment-level financial data for a company. Returns revenue and other financial metrics broken down by business segment and geographic region.",
  parameters,
  category: "finance",
  execute: async (params) => {
    const start = performance.now();
    try {
      const client = getFinancialClient();
      const queryParams: Record<string, string> = {
        ticker: params.ticker.toUpperCase(),
        period: params.period,
        limit: String(params.limit),
      };

      const data = await client.get<SegmentedFinancialsResponse>(
        "/financials/segmented",
        queryParams,
      );

      return {
        toolName: "get_segmented_financials",
        success: true,
        data: data.segmented_financials,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "get_segmented_financials",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
