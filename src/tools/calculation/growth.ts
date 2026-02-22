import { z } from "zod";
import { defineTool } from "../types.js";

const parameters = z.object({
  values: z
    .array(z.number())
    .min(2)
    .describe(
      "Array of numeric values ordered chronologically (oldest first). At least 2 values required.",
    ),
  type: z
    .enum(["yoy", "cagr", "sequential"])
    .describe(
      "Growth rate type: 'yoy' for year-over-year, 'cagr' for compound annual growth rate, 'sequential' for period-over-period",
    ),
});

interface GrowthResult {
  type: string;
  rates: number[];
  average_rate: number | null;
  summary: string;
}

function calculateYoY(values: number[]): number[] {
  const rates: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] === 0) {
      rates.push(values[i] > 0 ? Number.POSITIVE_INFINITY : values[i] < 0 ? Number.NEGATIVE_INFINITY : 0);
    } else {
      rates.push((values[i] - values[i - 1]) / Math.abs(values[i - 1]));
    }
  }
  return rates;
}

function calculateSequential(values: number[]): number[] {
  // Same math as YoY but semantically represents period-over-period
  return calculateYoY(values);
}

function calculateCAGR(values: number[]): number[] {
  const n = values.length - 1;
  if (n <= 0) return [];

  const first = values[0];
  const last = values[values.length - 1];

  if (first <= 0 || last <= 0) {
    // CAGR is undefined for non-positive values
    return [Number.NaN];
  }

  const cagr = (last / first) ** (1 / n) - 1;
  return [cagr];
}

function mean(rates: number[]): number | null {
  const finite = rates.filter((r) => Number.isFinite(r));
  if (finite.length === 0) return null;
  return finite.reduce((sum, r) => sum + r, 0) / finite.length;
}

export const calculateGrowthRates = defineTool({
  name: "calculate_growth_rates",
  description:
    "Calculate growth rates from a series of numeric values. Supports year-over-year (yoy), compound annual growth rate (cagr), and sequential period-over-period growth. Values should be ordered chronologically with oldest first. Pure local computation with no API calls.",
  parameters,
  category: "calculation",
  execute: async (params) => {
    const start = performance.now();
    try {
      let rates: number[];
      switch (params.type) {
        case "yoy":
          rates = calculateYoY(params.values);
          break;
        case "cagr":
          rates = calculateCAGR(params.values);
          break;
        case "sequential":
          rates = calculateSequential(params.values);
          break;
      }

      const avgRate = mean(rates);

      const formattedRates = rates.map((r) =>
        Number.isFinite(r) ? Math.round(r * 10000) / 10000 : r,
      );

      let summary: string;
      if (params.type === "cagr") {
        const cagrPct = Number.isFinite(rates[0])
          ? `${(rates[0] * 100).toFixed(2)}%`
          : "N/A (non-positive values)";
        summary = `CAGR over ${params.values.length - 1} periods: ${cagrPct}`;
      } else {
        const label = params.type === "yoy" ? "Year-over-year" : "Sequential";
        const avgPct =
          avgRate !== null ? `${(avgRate * 100).toFixed(2)}%` : "N/A";
        summary = `${label} growth across ${rates.length} periods. Average: ${avgPct}`;
      }

      const result: GrowthResult = {
        type: params.type,
        rates: formattedRates,
        average_rate: avgRate !== null ? Math.round(avgRate * 10000) / 10000 : null,
        summary,
      };

      return {
        toolName: "calculate_growth_rates",
        success: true,
        data: result,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "calculate_growth_rates",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
