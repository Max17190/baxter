import { z } from "zod";
import { defineTool } from "../types.js";
import { getEdgarClient } from "./client.js";

const params = z.object({
  cik: z.string().describe("Company CIK number (e.g., '0000320193' for Apple)"),
});

interface SubmissionsResponse {
  cik: string;
  entityType: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
}

export const edgarGetFilings = defineTool({
  name: "edgar_get_filings",
  description:
    "Get the filing history for a company from SEC EDGAR by CIK. Returns recent filings with dates, form types, and accession numbers. Free — no API key needed.",
  parameters: params,
  category: "edgar",
  execute: async (params) => {
    const start = performance.now();
    try {
      const client = getEdgarClient();
      const raw = (await client.getSubmissions(params.cik)) as SubmissionsResponse;

      // Extract a condensed list of recent filings
      const recent = raw.filings?.recent;
      const filings = recent
        ? recent.accessionNumber.slice(0, 20).map((acc, i) => ({
            accessionNumber: acc,
            filingDate: recent.filingDate[i],
            form: recent.form[i],
            primaryDocument: recent.primaryDocument[i],
          }))
        : [];

      return {
        toolName: "edgar_get_filings",
        success: true,
        data: {
          cik: raw.cik,
          name: raw.name,
          tickers: raw.tickers,
          exchanges: raw.exchanges,
          recentFilings: filings,
        },
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "edgar_get_filings",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
