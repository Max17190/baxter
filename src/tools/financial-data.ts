import { generateObject } from "ai";
import { z } from "zod";
import type { LanguageModelV1 } from "ai";
import { defineTool } from "./types.js";
import type { ToolResult } from "../types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("financial-data");

/**
 * Sub-tool routing schema. The fast model classifies the request
 * and extracts structured parameters for the right sub-tool.
 */
const routingSchema = z.object({
  subTool: z.enum([
    "income_statements",
    "balance_sheets",
    "cash_flows",
    "prices",
    "key_metrics",
    "sec_filings",
    "insider_trades",
    "institutional_holdings",
    "analyst_estimates",
    "segmented_financials",
    "financial_search",
    "edgar_filings",
    "edgar_financial_facts",
  ]),
  ticker: z.string().describe("Resolved stock ticker symbol (e.g. AAPL)"),
  period: z.enum(["annual", "quarterly", "ttm"]).optional(),
  limit: z.number().int().positive().max(100).optional(),
  filingType: z.string().optional().describe("For SEC filings: 10-K, 10-Q, 8-K"),
  startDate: z.string().optional().describe("YYYY-MM-DD for price data"),
  endDate: z.string().optional().describe("YYYY-MM-DD for price data"),
  searchQuery: z.string().optional().describe("For financial_search sub-tool"),
  xbrlConcept: z.string().optional().describe("For EDGAR: Revenues, NetIncomeLoss, Assets, etc."),
});

const ROUTING_PROMPT = `You route financial data requests to the correct data source. Given a natural language query about financial data, determine:

1. Which sub-tool to use:
   - income_statements: Revenue, COGS, gross profit, operating expenses, net income, EPS
   - balance_sheets: Assets, liabilities, equity, cash, debt, inventory
   - cash_flows: Operating/investing/financing cash flows, free cash flow, capex, buybacks
   - prices: Historical stock prices (OHLCV), price history
   - key_metrics: PE ratio, PB ratio, market cap, dividend yield, ROE, ROA, margins
   - sec_filings: SEC filing documents (10-K, 10-Q, 8-K), filing metadata
   - insider_trades: Insider buying/selling activity
   - institutional_holdings: Top institutional shareholders
   - analyst_estimates: Wall Street consensus estimates (EPS, revenue)
   - segmented_financials: Revenue/profit by business segment
   - financial_search: General financial data search (when no specific sub-tool fits)
   - edgar_filings: SEC filing list from EDGAR (free, no API key needed)
   - edgar_financial_facts: XBRL financial data from EDGAR (free, for specific accounting concepts)

2. The ticker symbol (resolve company names: "Apple" -> "AAPL", "Microsoft" -> "MSFT")
3. Relevant parameters (period, limit, date range, etc.)

Default to annual period and limit of 5 unless the query specifies otherwise.
For EDGAR financial facts, map requests to XBRL concepts (e.g. revenue -> "Revenues", net income -> "NetIncomeLoss").`;

/** Configuration for which data sources are available */
interface FinancialDataConfig {
  financialDatasetsApiKey?: string;
  fastModel: LanguageModelV1;
}

/** The sub-tool executors — imported lazily to avoid circular deps */
let _executors: Record<string, (params: Record<string, string>) => Promise<ToolResult>> | null = null;

async function getExecutors(config: FinancialDataConfig) {
  if (_executors) return _executors;

  const hasPaidAPI = !!config.financialDatasetsApiKey;
  const executors: Record<string, (params: Record<string, string>) => Promise<ToolResult>> = {};

  // Always register EDGAR tools (free)
  const { getEdgarClient } = await import("./edgar/client.js");
  const edgar = getEdgarClient();

  executors.edgar_filings = async (p) => {
    const start = performance.now();
    try {
      const cik = await edgar.resolveCIK(p.ticker);
      if (!cik) return { toolName: "edgar_filings", success: false, error: `Could not resolve ticker ${p.ticker} to CIK`, durationMs: Math.round(performance.now() - start) };
      const data = await edgar.getSubmissions(cik);
      return {
        toolName: "edgar_filings", success: true, data, durationMs: Math.round(performance.now() - start),
        sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40`,
        sourceDescription: `SEC EDGAR filings for ${p.ticker}`,
      };
    } catch (e) { return { toolName: "edgar_filings", success: false, error: e instanceof Error ? e.message : String(e), durationMs: Math.round(performance.now() - start) }; }
  };

  executors.edgar_financial_facts = async (p) => {
    const start = performance.now();
    try {
      const cik = await edgar.resolveCIK(p.ticker);
      if (!cik) return { toolName: "edgar_financial_facts", success: false, error: `Could not resolve ticker ${p.ticker} to CIK`, durationMs: Math.round(performance.now() - start) };
      const data = p.concept
        ? await edgar.getCompanyConcept(cik, "us-gaap", p.concept)
        : await edgar.getCompanyFacts(cik);
      const paddedCik = cik.padStart(10, "0");
      return {
        toolName: "edgar_financial_facts", success: true, data, durationMs: Math.round(performance.now() - start),
        sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${paddedCik}.json`,
        sourceDescription: `SEC EDGAR XBRL for ${p.ticker}`,
      };
    } catch (e) { return { toolName: "edgar_financial_facts", success: false, error: e instanceof Error ? e.message : String(e), durationMs: Math.round(performance.now() - start) }; }
  };

  // Register paid API tools only if key exists
  if (hasPaidAPI) {
    const { getFinancialClient } = await import("./finance/client.js");
    const client = getFinancialClient();

    const makeFinanceTool = (name: string, path: string, responseKey: string) => {
      return async (p: Record<string, string>): Promise<ToolResult> => {
        const start = performance.now();
        try {
          const data = await client.get<Record<string, unknown>>(path, p);
          const ticker = p.ticker ?? "";
          return {
            toolName: name, success: true, data: data[responseKey], durationMs: Math.round(performance.now() - start),
            sourceUrl: `https://api.financialdatasets.ai${path}?ticker=${ticker}`,
            sourceDescription: `Financial Datasets: ${name} for ${ticker}`,
          };
        } catch (e) { return { toolName: name, success: false, error: e instanceof Error ? e.message : String(e), durationMs: Math.round(performance.now() - start) }; }
      };
    };

    executors.income_statements = makeFinanceTool("income_statements", "/financials/income-statements", "income_statements");
    executors.balance_sheets = makeFinanceTool("balance_sheets", "/financials/balance-sheets", "balance_sheets");
    executors.cash_flows = makeFinanceTool("cash_flows", "/financials/cash-flow-statements", "cash_flow_statements");
    executors.prices = makeFinanceTool("prices", "/prices", "prices");
    executors.key_metrics = makeFinanceTool("key_metrics", "/financials/metrics", "metrics");
    executors.sec_filings = makeFinanceTool("sec_filings", "/sec/filings", "filings");
    executors.insider_trades = makeFinanceTool("insider_trades", "/insider-trades", "insider_trades");
    executors.institutional_holdings = makeFinanceTool("institutional_holdings", "/institutional-holdings", "institutional_holdings");
    executors.analyst_estimates = makeFinanceTool("analyst_estimates", "/analyst-estimates", "analyst_estimates");
    executors.segmented_financials = makeFinanceTool("segmented_financials", "/financials/segmented", "segmented_financials");
    executors.financial_search = async (p: Record<string, string>): Promise<ToolResult> => {
      const start = performance.now();
      try {
        const data = await client.get<{ results: unknown[] }>("/search", p);
        return {
          toolName: "financial_search", success: true, data: data.results, durationMs: Math.round(performance.now() - start),
          sourceUrl: `https://api.financialdatasets.ai/search?query=${encodeURIComponent(p.query ?? "")}`,
          sourceDescription: `Financial Datasets: search for "${p.query ?? ""}"`,
        };
      } catch (e) { return { toolName: "financial_search", success: false, error: e instanceof Error ? e.message : String(e), durationMs: Math.round(performance.now() - start) }; }
    };
  }

  _executors = executors;
  return executors;
}

// The single parameter the LLM sees
const parameters = z.object({
  query: z.string().describe(
    "Natural language financial data request. Examples: 'AAPL income statements last 3 years', 'What is Tesla's PE ratio?', 'NVDA insider trades', 'Microsoft revenue by segment'",
  ),
});

/**
 * Creates the financial_data tool with bound config.
 * This is the ONLY financial tool the LLM sees — it routes internally.
 */
export function createFinancialDataTool(config: FinancialDataConfig) {
  return defineTool({
    name: "financial_data",
    description:
      "Get any financial data: income statements, balance sheets, cash flows, stock prices, key metrics (PE, ROE, margins), SEC filings, insider trades, institutional holdings, analyst estimates, and segment breakdowns. Supports all public US companies. Just describe what data you need in plain English.",
    parameters,
    category: "finance",
    cacheable: false, // the router result varies; sub-tool caching is handled internally
    execute: async (params) => {
      const start = performance.now();
      try {
        // Step 1: Use fast model to route the request
        const routing = await generateObject({
          model: config.fastModel,
          schema: routingSchema,
          system: ROUTING_PROMPT,
          prompt: params.query,
        });

        const route = routing.object;
        log.info({ subTool: route.subTool, ticker: route.ticker }, "Routed financial data request");

        // Step 2: Get the right executor
        const executors = await getExecutors(config);
        const executor = executors[route.subTool];

        if (!executor) {
          // Fallback: if paid API sub-tool not available, try EDGAR equivalents
          if (route.subTool === "sec_filings" || route.subTool === "edgar_filings") {
            const edgarExec = executors.edgar_filings;
            if (edgarExec) return edgarExec({ ticker: route.ticker });
          }
          if (["income_statements", "balance_sheets", "cash_flows", "key_metrics"].includes(route.subTool)) {
            const edgarExec = executors.edgar_financial_facts;
            if (edgarExec) {
              // Map to XBRL concepts
              const conceptMap: Record<string, string> = {
                income_statements: "Revenues",
                balance_sheets: "Assets",
                cash_flows: "NetCashProvidedByOperatingActivities",
                key_metrics: "",
              };
              const concept = route.xbrlConcept || conceptMap[route.subTool] || "";
              return edgarExec({ ticker: route.ticker, concept });
            }
          }
          return {
            toolName: "financial_data",
            success: false,
            error: `Data source "${route.subTool}" is not available. Set FINANCIAL_DATASETS_API_KEY for full access, or try rephrasing to use free SEC EDGAR data.`,
            durationMs: Math.round(performance.now() - start),
          };
        }

        // Step 3: Build params and execute
        const subParams: Record<string, string> = { ticker: route.ticker.toUpperCase() };
        if (route.period) subParams.period = route.period;
        if (route.limit) subParams.limit = String(route.limit);
        if (route.filingType) subParams.filing_type = route.filingType;
        if (route.startDate) subParams.start_date = route.startDate;
        if (route.endDate) subParams.end_date = route.endDate;
        if (route.searchQuery) subParams.query = route.searchQuery;
        if (route.xbrlConcept) subParams.concept = route.xbrlConcept;

        return executor(subParams);
      } catch (error) {
        return {
          toolName: "financial_data",
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Math.round(performance.now() - start),
        };
      }
    },
  });
}
