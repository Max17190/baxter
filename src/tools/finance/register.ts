import type { Config } from "../../config.js";
import { toolRegistry } from "../registry.js";
import { getIncomeStatements } from "./income-statements.js";
import { getBalanceSheets } from "./balance-sheets.js";
import { getCashFlows } from "./cash-flows.js";
import { getPrices } from "./prices.js";
import { getKeyMetrics } from "./key-metrics.js";
import { getSecFilings } from "./sec-filings.js";
import { getInsiderTrades } from "./insider-trades.js";
import { getInstitutionalHoldings } from "./institutional-holdings.js";
import { getAnalystEstimates } from "./analyst-estimates.js";
import { getSegmentedFinancials } from "./segmented-financials.js";
import { searchFinancialData } from "./financial-search.js";

const FINANCE_TOOLS = [
  getIncomeStatements,
  getBalanceSheets,
  getCashFlows,
  getPrices,
  getKeyMetrics,
  getSecFilings,
  getInsiderTrades,
  getInstitutionalHoldings,
  getAnalystEstimates,
  getSegmentedFinancials,
  searchFinancialData,
];

export function registerFinanceTools(config: Config): void {
  if (!config.financialDatasetsApiKey) return;
  for (const tool of FINANCE_TOOLS) {
    toolRegistry.register(tool);
  }
}
