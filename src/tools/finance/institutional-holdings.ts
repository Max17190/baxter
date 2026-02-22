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
    .describe("Number of institutional holdings to return (default 20, max 100)"),
});

interface InstitutionalHoldingsResponse {
  institutional_holdings: unknown[];
}

export const getInstitutionalHoldings = defineTool({
  name: "get_institutional_holdings",
  description:
    "Retrieve institutional ownership data for a company. Returns details about major institutional holders including fund name, shares held, portfolio percentage, and changes in position.",
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

      const data = await client.get<InstitutionalHoldingsResponse>(
        "/institutional-holdings",
        queryParams,
      );

      return {
        toolName: "get_institutional_holdings",
        success: true,
        data: data.institutional_holdings,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "get_institutional_holdings",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
