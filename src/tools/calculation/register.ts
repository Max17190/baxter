import { toolRegistry } from "../registry.js";
import { calculateFinancialRatios } from "./ratios.js";
import { calculateGrowthRates } from "./growth.js";
import { calculateStatistics } from "./statistics.js";
import { calculateDCF } from "./dcf-engine.js";

const CALCULATION_TOOLS = [
  calculateFinancialRatios,
  calculateGrowthRates,
  calculateStatistics,
  calculateDCF,
];

export function registerCalculationTools(): void {
  for (const tool of CALCULATION_TOOLS) {
    toolRegistry.register(tool);
  }
}
