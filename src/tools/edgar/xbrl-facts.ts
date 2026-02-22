import { z } from "zod";
import { defineTool } from "../types.js";
import { getEdgarClient } from "./client.js";

const params = z.object({
  cik: z.string().describe("Company CIK number"),
  concept: z
    .string()
    .optional()
    .describe(
      "Specific XBRL concept to retrieve (e.g., 'Revenues', 'NetIncomeLoss', 'Assets'). If omitted, returns all facts.",
    ),
  taxonomy: z
    .string()
    .optional()
    .default("us-gaap")
    .describe("XBRL taxonomy (default: 'us-gaap')"),
});

export const edgarGetFinancialFacts = defineTool({
  name: "edgar_get_financial_facts",
  description:
    "Get structured XBRL financial facts from SEC EDGAR for a company. Returns actual financial data (revenue, net income, assets, etc.) from filed reports. Free — no API key needed.",
  parameters: params,
  category: "edgar",
  execute: async (params) => {
    const start = performance.now();
    try {
      const client = getEdgarClient();

      let data: unknown;
      if (params.concept) {
        // Get specific concept
        data = await client.getCompanyConcept(
          params.cik,
          params.taxonomy ?? "us-gaap",
          params.concept,
        );
      } else {
        // Get all company facts
        data = await client.getCompanyFacts(params.cik);
      }

      return {
        toolName: "edgar_get_financial_facts",
        success: true,
        data,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "edgar_get_financial_facts",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
