import { z } from "zod";
import { defineTool } from "../types.js";
import { getFinancialClient } from "./client.js";

const parameters = z.object({
  ticker: z.string().describe("Stock ticker symbol (e.g. AAPL, MSFT)"),
  period: z
    .enum(["annual", "quarterly", "ttm"])
    .describe("Reporting period: annual, quarterly, or trailing twelve months"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(5)
    .describe("Number of statements to return (default 5, max 100)"),
});

interface IncomeStatementsResponse {
  income_statements: unknown[];
}

export const getIncomeStatements = defineTool({
  name: "get_income_statements",
  description:
    "Retrieve income statements for a company. Returns revenue, cost of goods sold, gross profit, operating expenses, EBITDA, net income, EPS, and other income statement line items across multiple periods.",
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

      const data = await client.get<IncomeStatementsResponse>(
        "/financials/income-statements",
        queryParams,
      );

      return {
        toolName: "get_income_statements",
        success: true,
        data: data.income_statements,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "get_income_statements",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
