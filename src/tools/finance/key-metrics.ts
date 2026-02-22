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

interface KeyMetricsResponse {
  metrics: unknown[];
}

export const getKeyMetrics = defineTool({
  name: "get_key_metrics",
  description:
    "Retrieve key financial metrics for a company. Returns valuation ratios, profitability metrics, liquidity ratios, and other pre-computed financial metrics across multiple periods.",
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

      const data = await client.get<KeyMetricsResponse>(
        "/financials/metrics",
        queryParams,
      );

      return {
        toolName: "get_key_metrics",
        success: true,
        data: data.metrics,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "get_key_metrics",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
