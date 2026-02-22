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
    .describe("Number of statements to return (default 5, max 100)"),
});

interface CashFlowsResponse {
  cash_flow_statements: unknown[];
}

export const getCashFlows = defineTool({
  name: "get_cash_flows",
  description:
    "Retrieve cash flow statements for a company. Returns operating cash flow, capital expenditures, free cash flow, dividends paid, share buybacks, and other cash flow line items across multiple periods.",
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

      const data = await client.get<CashFlowsResponse>(
        "/financials/cash-flow-statements",
        queryParams,
      );

      return {
        toolName: "get_cash_flows",
        success: true,
        data: data.cash_flow_statements,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "get_cash_flows",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
