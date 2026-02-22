import { z } from "zod";
import { defineTool } from "../types.js";
import { getFinancialClient } from "./client.js";

const parameters = z.object({
  ticker: z.string().describe("Stock ticker symbol (e.g. AAPL, MSFT)"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(20)
    .describe("Number of insider trades to return (default 20, max 100)"),
});

interface InsiderTradesResponse {
  insider_trades: unknown[];
}

export const getInsiderTrades = defineTool({
  name: "get_insider_trades",
  description:
    "Retrieve insider trading activity for a company. Returns details about insider buys, sells, and exercises including insider name, title, transaction date, shares traded, and price.",
  parameters,
  category: "finance",
  execute: async (params) => {
    const start = performance.now();
    try {
      const client = getFinancialClient();
      const queryParams: Record<string, string> = {
        ticker: params.ticker.toUpperCase(),
        limit: String(params.limit),
      };

      const data = await client.get<InsiderTradesResponse>(
        "/insider-trades",
        queryParams,
      );

      return {
        toolName: "get_insider_trades",
        success: true,
        data: data.insider_trades,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "get_insider_trades",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
