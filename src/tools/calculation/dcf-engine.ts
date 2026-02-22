import { z } from "zod";
import { defineTool } from "../types.js";

const parameters = z.object({
  free_cash_flows: z
    .array(z.number())
    .min(1)
    .describe(
      "Projected future free cash flows, ordered by year (year 1, year 2, ...). At least 1 year required.",
    ),
  discount_rate: z
    .number()
    .min(0)
    .max(1)
    .describe("Weighted average cost of capital (WACC) as a decimal (e.g. 0.10 for 10%)"),
  terminal_growth_rate: z
    .number()
    .min(0)
    .max(0.10)
    .describe(
      "Perpetual growth rate for terminal value as a decimal (e.g. 0.025 for 2.5%). Must be less than discount_rate.",
    ),
  shares_outstanding: z
    .number()
    .positive()
    .describe("Total shares outstanding for per-share value calculation"),
  net_debt: z
    .number()
    .optional()
    .default(0)
    .describe(
      "Net debt (total debt minus cash). Subtracted from enterprise value to get equity value. Default 0.",
    ),
  margin_of_safety: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .default(0.25)
    .describe("Margin of safety percentage as a decimal (default 0.25 for 25%)"),
});

interface DCFResult {
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
}

function computeDCF(params: z.infer<typeof parameters>): DCFResult {
  const {
    free_cash_flows,
    discount_rate,
    terminal_growth_rate,
    shares_outstanding,
    net_debt,
    margin_of_safety,
  } = params;

  if (terminal_growth_rate >= discount_rate) {
    throw new Error(
      `Terminal growth rate (${terminal_growth_rate}) must be less than discount rate (${discount_rate}) for the Gordon Growth Model to be valid.`,
    );
  }

  const n = free_cash_flows.length;
  const yearlyBreakdown: DCFResult["yearly_pv_breakdown"] = [];
  let pvOfCashFlows = 0;

  // Discount each projected FCF to present value
  for (let i = 0; i < n; i++) {
    const year = i + 1;
    const discountFactor = 1 / (1 + discount_rate) ** year;
    const pv = free_cash_flows[i] * discountFactor;
    pvOfCashFlows += pv;

    yearlyBreakdown.push({
      year,
      fcf: free_cash_flows[i],
      discount_factor: Math.round(discountFactor * 10000) / 10000,
      present_value: Math.round(pv * 100) / 100,
    });
  }

  // Terminal value using Gordon Growth Model
  const terminalFCF = free_cash_flows[n - 1] * (1 + terminal_growth_rate);
  const terminalValue = terminalFCF / (discount_rate - terminal_growth_rate);
  const pvOfTerminalValue = terminalValue / (1 + discount_rate) ** n;

  // Enterprise and equity value
  const enterpriseValue = pvOfCashFlows + pvOfTerminalValue;
  const equityValue = enterpriseValue - net_debt;
  const intrinsicValuePerShare = equityValue / shares_outstanding;
  const intrinsicWithMoS = intrinsicValuePerShare * (1 - margin_of_safety);

  return {
    pv_of_cash_flows: Math.round(pvOfCashFlows * 100) / 100,
    terminal_value: Math.round(terminalValue * 100) / 100,
    pv_of_terminal_value: Math.round(pvOfTerminalValue * 100) / 100,
    enterprise_value: Math.round(enterpriseValue * 100) / 100,
    equity_value: Math.round(equityValue * 100) / 100,
    intrinsic_value_per_share: Math.round(intrinsicValuePerShare * 100) / 100,
    intrinsic_value_with_margin_of_safety: Math.round(intrinsicWithMoS * 100) / 100,
    margin_of_safety_pct: margin_of_safety,
    assumptions: {
      projection_years: n,
      discount_rate,
      terminal_growth_rate,
      shares_outstanding,
      net_debt,
    },
    yearly_pv_breakdown: yearlyBreakdown,
  };
}

export const calculateDCF = defineTool({
  name: "calculate_dcf",
  description:
    "Calculate a Discounted Cash Flow (DCF) valuation. Takes projected free cash flows, discount rate (WACC), terminal growth rate, and shares outstanding to compute enterprise value, equity value, and intrinsic value per share. Uses the Gordon Growth Model for terminal value. Applies a configurable margin of safety. Pure local computation with no API calls.",
  parameters,
  category: "calculation",
  execute: async (params) => {
    const start = performance.now();
    try {
      const result = computeDCF(params);
      return {
        toolName: "calculate_dcf",
        success: true,
        data: result,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "calculate_dcf",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
