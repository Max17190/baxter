import { z } from "zod";
import { defineTool } from "../types.js";

const parameters = z.object({
  values: z
    .array(z.number())
    .min(1)
    .describe("Array of numeric values to analyze. At least 1 value required."),
  operations: z
    .array(z.enum(["mean", "median", "stddev", "min", "max", "percentile"]))
    .min(1)
    .describe("Statistical operations to compute"),
  percentiles: z
    .array(z.number().min(0).max(100))
    .optional()
    .describe(
      "Percentile values to compute (0-100) when 'percentile' is in operations",
    ),
});

interface StatisticsResult {
  count: number;
  mean?: number;
  median?: number;
  stddev?: number;
  min?: number;
  max?: number;
  percentiles?: Record<string, number>;
}

function computeMean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function computeStddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = computeMean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  // Sample standard deviation (Bessel's correction)
  const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computePercentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const fraction = index - lower;
  return sortedValues[lower] + fraction * (sortedValues[upper] - sortedValues[lower]);
}

export const calculateStatistics = defineTool({
  name: "calculate_statistics",
  description:
    "Calculate basic descriptive statistics on an array of numeric values. Supports mean, median, standard deviation, min, max, and percentile calculations. Pure local computation with no API calls.",
  parameters,
  category: "calculation",
  execute: async (params) => {
    const start = performance.now();
    try {
      const { values, operations, percentiles: pctValues } = params;
      const result: StatisticsResult = { count: values.length };
      const sorted = [...values].sort((a, b) => a - b);

      for (const op of operations) {
        switch (op) {
          case "mean":
            result.mean = computeMean(values);
            break;
          case "median":
            result.median = computeMedian(values);
            break;
          case "stddev":
            result.stddev = computeStddev(values);
            break;
          case "min":
            result.min = sorted[0];
            break;
          case "max":
            result.max = sorted[sorted.length - 1];
            break;
          case "percentile": {
            const targets = pctValues ?? [25, 50, 75];
            result.percentiles = {};
            for (const p of targets) {
              result.percentiles[`p${p}`] = computePercentile(sorted, p);
            }
            break;
          }
        }
      }

      return {
        toolName: "calculate_statistics",
        success: true,
        data: result,
        durationMs: Math.round(performance.now() - start),
      };
    } catch (error) {
      return {
        toolName: "calculate_statistics",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - start),
      };
    }
  },
});
