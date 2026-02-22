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

interface BalanceSheetsResponse {
  balance_sheets: unknown[];
}

export const getBalanceSheets = defineTool({
  name: "get_balance_sheets",
  description:
    "Retrieve balance sheets for a company. Returns total assets, total liabilities, shareholders equity, cash, debt, inventory, receivables, and other balance sheet line items across multiple periods.",
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

      const data = await client.get<BalanceSheetsResponse>(
        "/financials/balance-sheets",
        queryParams,
      );

      return {
        toolName: "get_balance_sheets",
        success: true,
        data: data.balance_sheets,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "get_balance_sheets",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
