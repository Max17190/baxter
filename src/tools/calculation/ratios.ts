import { z } from "zod";
import { defineTool } from "../types.js";

const parameters = z.object({
  income_statement: z.object({
    revenue: z.number().describe("Total revenue"),
    cost_of_revenue: z.number().describe("Cost of goods sold / cost of revenue"),
    gross_profit: z.number().describe("Gross profit"),
    operating_income: z.number().describe("Operating income (EBIT)"),
    ebitda: z.number().describe("EBITDA"),
    net_income: z.number().describe("Net income"),
    interest_expense: z.number().optional().describe("Interest expense"),
    income_tax_expense: z.number().optional().describe("Income tax expense"),
    eps_diluted: z.number().optional().describe("Diluted earnings per share"),
    weighted_avg_shares_diluted: z
      .number()
      .optional()
      .describe("Weighted average diluted shares outstanding"),
  }),
  balance_sheet: z.object({
    total_assets: z.number().describe("Total assets"),
    total_liabilities: z.number().describe("Total liabilities"),
    total_equity: z.number().describe("Total shareholders equity"),
    current_assets: z.number().describe("Total current assets"),
    current_liabilities: z.number().describe("Total current liabilities"),
    cash_and_equivalents: z.number().describe("Cash and cash equivalents"),
    total_debt: z.number().describe("Total debt (short-term + long-term)"),
    inventory: z.number().optional().describe("Total inventory"),
    accounts_receivable: z.number().optional().describe("Accounts receivable"),
  }),
  market_data: z
    .object({
      stock_price: z.number().describe("Current stock price"),
      shares_outstanding: z.number().describe("Total shares outstanding"),
      market_cap: z.number().optional().describe("Market capitalization"),
    })
    .optional()
    .describe("Market data for valuation ratios (optional)"),
});

interface FinancialRatios {
  profitability: {
    gross_margin: number;
    operating_margin: number;
    net_profit_margin: number;
    ebitda_margin: number;
    return_on_equity: number;
    return_on_assets: number;
    return_on_invested_capital: number | null;
  };
  liquidity: {
    current_ratio: number;
    quick_ratio: number | null;
    cash_ratio: number;
  };
  leverage: {
    debt_to_equity: number;
    debt_to_assets: number;
    equity_multiplier: number;
    interest_coverage: number | null;
  };
  efficiency: {
    asset_turnover: number;
    inventory_turnover: number | null;
    receivables_turnover: number | null;
  };
  valuation: {
    pe_ratio: number | null;
    pb_ratio: number | null;
    ps_ratio: number | null;
    ev_to_ebitda: number | null;
    earnings_yield: number | null;
  } | null;
}

function safeDiv(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function computeRatios(
  params: z.infer<typeof parameters>,
): FinancialRatios {
  const { income_statement: is, balance_sheet: bs, market_data: md } = params;

  // Profitability
  const grossMargin = safeDiv(is.gross_profit, is.revenue) ?? 0;
  const operatingMargin = safeDiv(is.operating_income, is.revenue) ?? 0;
  const netProfitMargin = safeDiv(is.net_income, is.revenue) ?? 0;
  const ebitdaMargin = safeDiv(is.ebitda, is.revenue) ?? 0;
  const roe = safeDiv(is.net_income, bs.total_equity) ?? 0;
  const roa = safeDiv(is.net_income, bs.total_assets) ?? 0;

  // ROIC: NOPAT / Invested Capital
  let roic: number | null = null;
  if (is.income_tax_expense !== undefined) {
    const taxRate = safeDiv(is.income_tax_expense, is.operating_income + (is.income_tax_expense ?? 0));
    const effectiveTaxRate = taxRate !== null ? Math.max(0, Math.min(1, taxRate)) : 0.25;
    const nopat = is.operating_income * (1 - effectiveTaxRate);
    const investedCapital = bs.total_equity + bs.total_debt - bs.cash_and_equivalents;
    roic = safeDiv(nopat, investedCapital);
  }

  // Liquidity
  const currentRatio = safeDiv(bs.current_assets, bs.current_liabilities) ?? 0;
  const quickAssets = bs.current_assets - (bs.inventory ?? 0);
  const quickRatio = bs.inventory !== undefined ? safeDiv(quickAssets, bs.current_liabilities) : null;
  const cashRatio = safeDiv(bs.cash_and_equivalents, bs.current_liabilities) ?? 0;

  // Leverage
  const debtToEquity = safeDiv(bs.total_debt, bs.total_equity) ?? 0;
  const debtToAssets = safeDiv(bs.total_debt, bs.total_assets) ?? 0;
  const equityMultiplier = safeDiv(bs.total_assets, bs.total_equity) ?? 0;
  const interestCoverage =
    is.interest_expense !== undefined && is.interest_expense > 0
      ? safeDiv(is.ebitda, is.interest_expense)
      : null;

  // Efficiency
  const assetTurnover = safeDiv(is.revenue, bs.total_assets) ?? 0;
  const inventoryTurnover =
    bs.inventory !== undefined ? safeDiv(is.cost_of_revenue, bs.inventory) : null;
  const receivablesTurnover =
    bs.accounts_receivable !== undefined
      ? safeDiv(is.revenue, bs.accounts_receivable)
      : null;

  // Valuation (only if market data provided)
  let valuation: FinancialRatios["valuation"] = null;
  if (md) {
    const marketCap = md.market_cap ?? md.stock_price * md.shares_outstanding;
    const enterpriseValue = marketCap + bs.total_debt - bs.cash_and_equivalents;

    valuation = {
      pe_ratio: safeDiv(md.stock_price, is.eps_diluted ?? safeDiv(is.net_income, md.shares_outstanding) ?? 0),
      pb_ratio: safeDiv(marketCap, bs.total_equity),
      ps_ratio: safeDiv(marketCap, is.revenue),
      ev_to_ebitda: safeDiv(enterpriseValue, is.ebitda),
      earnings_yield: safeDiv(
        is.eps_diluted ?? safeDiv(is.net_income, md.shares_outstanding) ?? 0,
        md.stock_price,
      ),
    };
  }

  return {
    profitability: {
      gross_margin: grossMargin,
      operating_margin: operatingMargin,
      net_profit_margin: netProfitMargin,
      ebitda_margin: ebitdaMargin,
      return_on_equity: roe,
      return_on_assets: roa,
      return_on_invested_capital: roic,
    },
    liquidity: {
      current_ratio: currentRatio,
      quick_ratio: quickRatio,
      cash_ratio: cashRatio,
    },
    leverage: {
      debt_to_equity: debtToEquity,
      debt_to_assets: debtToAssets,
      equity_multiplier: equityMultiplier,
      interest_coverage: interestCoverage,
    },
    efficiency: {
      asset_turnover: assetTurnover,
      inventory_turnover: inventoryTurnover,
      receivables_turnover: receivablesTurnover,
    },
    valuation,
  };
}

export const calculateFinancialRatios = defineTool({
  name: "calculate_financial_ratios",
  description:
    "Calculate comprehensive financial ratios from income statement and balance sheet data. Computes profitability (margins, ROE, ROA, ROIC), liquidity (current, quick, cash ratios), leverage (debt-to-equity, interest coverage), efficiency (asset/inventory turnover), and valuation metrics (PE, PB, EV/EBITDA) if market data is provided. Pure local computation with no API calls.",
  parameters,
  category: "calculation",
  execute: async (params) => {
    const start = performance.now();
    try {
      const ratios = computeRatios(params);
      return {
        toolName: "calculate_financial_ratios",
        success: true,
        data: ratios,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "calculate_financial_ratios",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
