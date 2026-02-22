import { describe, test, expect } from "bun:test";
import { calculateGrowthRates } from "../src/tools/calculation/growth.js";
import { calculateStatistics } from "../src/tools/calculation/statistics.js";
import { calculateDCF } from "../src/tools/calculation/dcf-engine.js";
import { calculateFinancialRatios } from "../src/tools/calculation/ratios.js";

describe("calculate_growth_rates", () => {
  test("calculates year-over-year growth rates", async () => {
    const result = await calculateGrowthRates.execute({
      values: [100, 120, 150],
      type: "yoy",
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("calculate_growth_rates");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const data = result.data as {
      type: string;
      rates: number[];
      average_rate: number | null;
      summary: string;
    };
    expect(data.type).toBe("yoy");
    // (120 - 100) / 100 = 0.2, (150 - 120) / 120 = 0.25
    expect(data.rates).toEqual([0.2, 0.25]);
    expect(data.average_rate).toBeCloseTo(0.225, 4);
    expect(data.summary).toContain("Year-over-year");
  });

  test("calculates CAGR correctly", async () => {
    // Start: 100, End: 200, over 3 periods => (200/100)^(1/3) - 1
    const result = await calculateGrowthRates.execute({
      values: [100, 130, 170, 200],
      type: "cagr",
    });

    expect(result.success).toBe(true);
    const data = result.data as {
      type: string;
      rates: number[];
      average_rate: number | null;
      summary: string;
    };
    expect(data.type).toBe("cagr");
    // CAGR = (200/100)^(1/3) - 1 = 0.2599...
    expect(data.rates).toHaveLength(1);
    expect(data.rates[0]).toBeCloseTo(0.2599, 3);
    expect(data.summary).toContain("CAGR over 3 periods");
  });

  test("calculates sequential growth rates", async () => {
    const result = await calculateGrowthRates.execute({
      values: [50, 75, 60],
      type: "sequential",
    });

    expect(result.success).toBe(true);
    const data = result.data as {
      type: string;
      rates: number[];
      average_rate: number | null;
      summary: string;
    };
    expect(data.type).toBe("sequential");
    // (75 - 50) / 50 = 0.5, (60 - 75) / 75 = -0.2
    expect(data.rates).toEqual([0.5, -0.2]);
    expect(data.summary).toContain("Sequential");
  });

  test("handles zero base value in yoy", async () => {
    const result = await calculateGrowthRates.execute({
      values: [0, 100],
      type: "yoy",
    });

    expect(result.success).toBe(true);
    const data = result.data as { rates: number[]; average_rate: number | null };
    expect(data.rates[0]).toBe(Infinity);
    // Infinity is not finite, so average of no finite values = null
    expect(data.average_rate).toBeNull();
  });

  test("CAGR returns NaN for non-positive values", async () => {
    const result = await calculateGrowthRates.execute({
      values: [-100, 200],
      type: "cagr",
    });

    expect(result.success).toBe(true);
    const data = result.data as { rates: number[] };
    expect(Number.isNaN(data.rates[0])).toBe(true);
  });
});

describe("calculate_statistics", () => {
  test("calculates mean correctly", async () => {
    const result = await calculateStatistics.execute({
      values: [10, 20, 30, 40, 50],
      operations: ["mean"],
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("calculate_statistics");
    const data = result.data as { count: number; mean: number };
    expect(data.count).toBe(5);
    expect(data.mean).toBe(30);
  });

  test("calculates median correctly for odd-length array", async () => {
    const result = await calculateStatistics.execute({
      values: [3, 1, 5, 2, 4],
      operations: ["median"],
    });

    expect(result.success).toBe(true);
    const data = result.data as { median: number };
    expect(data.median).toBe(3);
  });

  test("calculates median correctly for even-length array", async () => {
    const result = await calculateStatistics.execute({
      values: [1, 2, 3, 4],
      operations: ["median"],
    });

    expect(result.success).toBe(true);
    const data = result.data as { median: number };
    expect(data.median).toBe(2.5);
  });

  test("calculates standard deviation with Bessel's correction", async () => {
    const result = await calculateStatistics.execute({
      values: [2, 4, 4, 4, 5, 5, 7, 9],
      operations: ["stddev"],
    });

    expect(result.success).toBe(true);
    const data = result.data as { stddev: number };
    // Sample stddev of [2,4,4,4,5,5,7,9]: mean=5, sum of sq diffs=32, var=32/7=4.571, sd=2.138
    expect(data.stddev).toBeCloseTo(2.138, 2);
  });

  test("calculates min and max", async () => {
    const result = await calculateStatistics.execute({
      values: [42, 7, 99, -3, 55],
      operations: ["min", "max"],
    });

    expect(result.success).toBe(true);
    const data = result.data as { min: number; max: number };
    expect(data.min).toBe(-3);
    expect(data.max).toBe(99);
  });

  test("calculates percentiles with custom values", async () => {
    const result = await calculateStatistics.execute({
      values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      operations: ["percentile"],
      percentiles: [25, 50, 75],
    });

    expect(result.success).toBe(true);
    const data = result.data as { percentiles: Record<string, number> };
    expect(data.percentiles).toBeDefined();
    expect(data.percentiles.p50).toBeCloseTo(5.5, 1);
    expect(data.percentiles.p25).toBeCloseTo(3.25, 1);
    expect(data.percentiles.p75).toBeCloseTo(7.75, 1);
  });

  test("calculates multiple operations in one call", async () => {
    const result = await calculateStatistics.execute({
      values: [10, 20, 30],
      operations: ["mean", "median", "min", "max", "stddev"],
    });

    expect(result.success).toBe(true);
    const data = result.data as {
      count: number;
      mean: number;
      median: number;
      min: number;
      max: number;
      stddev: number;
    };
    expect(data.count).toBe(3);
    expect(data.mean).toBe(20);
    expect(data.median).toBe(20);
    expect(data.min).toBe(10);
    expect(data.max).toBe(30);
    expect(data.stddev).toBeCloseTo(10, 0);
  });
});

describe("calculate_dcf", () => {
  test("computes DCF valuation with known values", async () => {
    const result = await calculateDCF.execute({
      free_cash_flows: [100, 110, 121],
      discount_rate: 0.1,
      terminal_growth_rate: 0.03,
      shares_outstanding: 100,
      net_debt: 0,
      margin_of_safety: 0.25,
    });

    expect(result.success).toBe(true);
    expect(result.toolName).toBe("calculate_dcf");

    const data = result.data as {
      pv_of_cash_flows: number;
      terminal_value: number;
      pv_of_terminal_value: number;
      enterprise_value: number;
      equity_value: number;
      intrinsic_value_per_share: number;
      intrinsic_value_with_margin_of_safety: number;
      margin_of_safety_pct: number;
      assumptions: {
        projection_years: number;
        discount_rate: number;
        terminal_growth_rate: number;
        shares_outstanding: number;
        net_debt: number;
      };
      yearly_pv_breakdown: Array<{
        year: number;
        fcf: number;
        discount_factor: number;
        present_value: number;
      }>;
    };

    // Verify structure
    expect(data.assumptions.projection_years).toBe(3);
    expect(data.assumptions.discount_rate).toBe(0.1);
    expect(data.assumptions.terminal_growth_rate).toBe(0.03);
    expect(data.assumptions.shares_outstanding).toBe(100);
    expect(data.margin_of_safety_pct).toBe(0.25);

    // Verify yearly breakdown
    expect(data.yearly_pv_breakdown).toHaveLength(3);
    expect(data.yearly_pv_breakdown[0].year).toBe(1);
    expect(data.yearly_pv_breakdown[0].fcf).toBe(100);

    // PV of year 1: 100 / 1.1 = 90.91
    expect(data.yearly_pv_breakdown[0].present_value).toBeCloseTo(90.91, 1);

    // Terminal value: 121 * 1.03 / (0.10 - 0.03) = 124.63 / 0.07 = 1780.43
    expect(data.terminal_value).toBeCloseTo(1780.43, 0);

    // Enterprise value > 0 and equity_value should equal enterprise_value (no debt)
    expect(data.enterprise_value).toBeGreaterThan(0);
    expect(data.equity_value).toBe(data.enterprise_value);

    // Margin of safety applied
    expect(data.intrinsic_value_with_margin_of_safety).toBeCloseTo(
      data.intrinsic_value_per_share * 0.75,
      1,
    );
  });

  test("subtracts net debt from enterprise value", async () => {
    const result = await calculateDCF.execute({
      free_cash_flows: [100],
      discount_rate: 0.1,
      terminal_growth_rate: 0.02,
      shares_outstanding: 50,
      net_debt: 500,
      margin_of_safety: 0,
    });

    expect(result.success).toBe(true);
    const data = result.data as {
      enterprise_value: number;
      equity_value: number;
    };
    expect(data.equity_value).toBe(data.enterprise_value - 500);
  });

  test("fails when terminal growth rate >= discount rate", async () => {
    const result = await calculateDCF.execute({
      free_cash_flows: [100],
      discount_rate: 0.05,
      terminal_growth_rate: 0.05,
      shares_outstanding: 100,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Terminal growth rate");
    expect(result.error).toContain("must be less than discount rate");
  });
});

describe("calculate_financial_ratios", () => {
  const sampleIncomeStatement = {
    revenue: 1_000_000,
    cost_of_revenue: 600_000,
    gross_profit: 400_000,
    operating_income: 200_000,
    ebitda: 250_000,
    net_income: 150_000,
    interest_expense: 20_000,
    income_tax_expense: 30_000,
    eps_diluted: 3.0,
    weighted_avg_shares_diluted: 50_000,
  };

  const sampleBalanceSheet = {
    total_assets: 2_000_000,
    total_liabilities: 1_200_000,
    total_equity: 800_000,
    current_assets: 500_000,
    current_liabilities: 300_000,
    cash_and_equivalents: 100_000,
    total_debt: 400_000,
    inventory: 80_000,
    accounts_receivable: 120_000,
  };

  test("calculates profitability ratios correctly", async () => {
    const result = await calculateFinancialRatios.execute({
      income_statement: sampleIncomeStatement,
      balance_sheet: sampleBalanceSheet,
    });

    expect(result.success).toBe(true);
    const data = result.data as {
      profitability: {
        gross_margin: number;
        operating_margin: number;
        net_profit_margin: number;
        ebitda_margin: number;
        return_on_equity: number;
        return_on_assets: number;
        return_on_invested_capital: number | null;
      };
    };

    // Gross margin: 400k / 1M = 0.4
    expect(data.profitability.gross_margin).toBeCloseTo(0.4, 4);
    // Operating margin: 200k / 1M = 0.2
    expect(data.profitability.operating_margin).toBeCloseTo(0.2, 4);
    // Net profit margin: 150k / 1M = 0.15
    expect(data.profitability.net_profit_margin).toBeCloseTo(0.15, 4);
    // EBITDA margin: 250k / 1M = 0.25
    expect(data.profitability.ebitda_margin).toBeCloseTo(0.25, 4);
    // ROE: 150k / 800k = 0.1875
    expect(data.profitability.return_on_equity).toBeCloseTo(0.1875, 4);
    // ROA: 150k / 2M = 0.075
    expect(data.profitability.return_on_assets).toBeCloseTo(0.075, 4);
    // ROIC should be computed (income_tax_expense is provided)
    expect(data.profitability.return_on_invested_capital).not.toBeNull();
  });

  test("calculates liquidity ratios correctly", async () => {
    const result = await calculateFinancialRatios.execute({
      income_statement: sampleIncomeStatement,
      balance_sheet: sampleBalanceSheet,
    });

    expect(result.success).toBe(true);
    const data = result.data as {
      liquidity: {
        current_ratio: number;
        quick_ratio: number | null;
        cash_ratio: number;
      };
    };

    // Current ratio: 500k / 300k = 1.6667
    expect(data.liquidity.current_ratio).toBeCloseTo(1.6667, 3);
    // Quick ratio: (500k - 80k) / 300k = 1.4
    expect(data.liquidity.quick_ratio).toBeCloseTo(1.4, 4);
    // Cash ratio: 100k / 300k = 0.3333
    expect(data.liquidity.cash_ratio).toBeCloseTo(0.3333, 3);
  });

  test("calculates leverage ratios correctly", async () => {
    const result = await calculateFinancialRatios.execute({
      income_statement: sampleIncomeStatement,
      balance_sheet: sampleBalanceSheet,
    });

    expect(result.success).toBe(true);
    const data = result.data as {
      leverage: {
        debt_to_equity: number;
        debt_to_assets: number;
        equity_multiplier: number;
        interest_coverage: number | null;
      };
    };

    // D/E: 400k / 800k = 0.5
    expect(data.leverage.debt_to_equity).toBeCloseTo(0.5, 4);
    // D/A: 400k / 2M = 0.2
    expect(data.leverage.debt_to_assets).toBeCloseTo(0.2, 4);
    // Equity multiplier: 2M / 800k = 2.5
    expect(data.leverage.equity_multiplier).toBeCloseTo(2.5, 4);
    // Interest coverage: 250k / 20k = 12.5
    expect(data.leverage.interest_coverage).toBeCloseTo(12.5, 4);
  });

  test("calculates efficiency ratios correctly", async () => {
    const result = await calculateFinancialRatios.execute({
      income_statement: sampleIncomeStatement,
      balance_sheet: sampleBalanceSheet,
    });

    expect(result.success).toBe(true);
    const data = result.data as {
      efficiency: {
        asset_turnover: number;
        inventory_turnover: number | null;
        receivables_turnover: number | null;
      };
    };

    // Asset turnover: 1M / 2M = 0.5
    expect(data.efficiency.asset_turnover).toBeCloseTo(0.5, 4);
    // Inventory turnover: 600k / 80k = 7.5
    expect(data.efficiency.inventory_turnover).toBeCloseTo(7.5, 4);
    // Receivables turnover: 1M / 120k = 8.3333
    expect(data.efficiency.receivables_turnover).toBeCloseTo(8.3333, 3);
  });

  test("computes valuation ratios when market data is provided", async () => {
    const result = await calculateFinancialRatios.execute({
      income_statement: sampleIncomeStatement,
      balance_sheet: sampleBalanceSheet,
      market_data: {
        stock_price: 60,
        shares_outstanding: 50_000,
      },
    });

    expect(result.success).toBe(true);
    const data = result.data as {
      valuation: {
        pe_ratio: number | null;
        pb_ratio: number | null;
        ps_ratio: number | null;
        ev_to_ebitda: number | null;
        earnings_yield: number | null;
      } | null;
    };

    expect(data.valuation).not.toBeNull();
    // PE: 60 / 3.0 = 20
    expect(data.valuation!.pe_ratio).toBeCloseTo(20, 2);
    // Market cap = 60 * 50000 = 3M; PB: 3M / 800k = 3.75
    expect(data.valuation!.pb_ratio).toBeCloseTo(3.75, 2);
    // PS: 3M / 1M = 3
    expect(data.valuation!.ps_ratio).toBeCloseTo(3, 2);
    // EV = 3M + 400k - 100k = 3.3M; EV/EBITDA: 3.3M / 250k = 13.2
    expect(data.valuation!.ev_to_ebitda).toBeCloseTo(13.2, 1);
    // Earnings yield: 3.0 / 60 = 0.05
    expect(data.valuation!.earnings_yield).toBeCloseTo(0.05, 4);
  });

  test("returns null valuation when no market data provided", async () => {
    const result = await calculateFinancialRatios.execute({
      income_statement: sampleIncomeStatement,
      balance_sheet: sampleBalanceSheet,
    });

    expect(result.success).toBe(true);
    const data = result.data as { valuation: null };
    expect(data.valuation).toBeNull();
  });
});
