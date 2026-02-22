import { z } from "zod";
import { defineTool } from "../types.js";
import { getFinancialClient } from "./client.js";

const parameters = z.object({
  ticker: z.string().describe("Stock ticker symbol (e.g. AAPL, MSFT)"),
  period: z
    .enum(["annual", "quarterly"])
    .describe("Estimate period: annual or quarterly"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(5)
    .describe("Number of estimate records to return (default 5, max 100)"),
});

interface AnalystEstimatesResponse {
  analyst_estimates: unknown[];
}

export const getAnalystEstimates = defineTool({
  name: "get_analyst_estimates",
  description:
    "Retrieve Wall Street analyst consensus estimates for a company. Returns estimated revenue, EPS, EBITDA, and other metrics with high/low/average estimates and number of analysts.",
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

      const data = await client.get<AnalystEstimatesResponse>(
        "/analyst-estimates",
        queryParams,
      );

      return {
        toolName: "get_analyst_estimates",
        success: true,
        data: data.analyst_estimates,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "get_analyst_estimates",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
