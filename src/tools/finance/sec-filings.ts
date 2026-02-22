import { z } from "zod";
import { defineTool } from "../types.js";
import { getFinancialClient } from "./client.js";

const parameters = z.object({
  ticker: z.string().describe("Stock ticker symbol (e.g. AAPL, MSFT)"),
  filing_type: z
    .string()
    .optional()
    .describe("SEC filing type filter (e.g. 10-K, 10-Q, 8-K, S-1)"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(10)
    .describe("Number of filings to return (default 10, max 100)"),
});

interface SecFilingsResponse {
  filings: unknown[];
}

export const getSecFilings = defineTool({
  name: "get_sec_filings",
  description:
    "Retrieve SEC filings for a company. Returns filing type, date, URL, and metadata for 10-K, 10-Q, 8-K, and other SEC filings. Can be filtered by filing type.",
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
      if (params.filing_type) {
        queryParams.filing_type = params.filing_type;
      }

      const data = await client.get<SecFilingsResponse>(
        "/sec/filings",
        queryParams,
      );

      return {
        toolName: "get_sec_filings",
        success: true,
        data: data.filings,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "get_sec_filings",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
