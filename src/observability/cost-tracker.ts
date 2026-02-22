import type { TokenTracker } from "../llm/token-tracker.js";
import type { QueryCost } from "../types.js";

/** Formats and displays per-query cost breakdown */
export class CostTracker {
  constructor(private tokenTracker: TokenTracker) {}

  /** Get formatted cost summary */
  getSummary(): string {
    const cost = this.tokenTracker.getQueryCost();
    const lines: string[] = [];

    lines.push(`Total cost: $${cost.totalUsd.toFixed(4)}`);
    lines.push(`Total tokens: ${this.tokenTracker.totalTokens.toLocaleString()}`);
    lines.push("");

    if (Object.keys(cost.byModel).length > 0) {
      lines.push("By model:");
      for (const [model, usage] of Object.entries(cost.byModel)) {
        lines.push(
          `  ${model}: ${usage.totalTokens.toLocaleString()} tokens ($${usage.estimatedCostUsd.toFixed(4)})`,
        );
      }
    }

    return lines.join("\n");
  }

  /** Get raw cost data */
  getCost(): QueryCost {
    return this.tokenTracker.getQueryCost();
  }

  /** Reset for a new query */
  reset(): void {
    this.tokenTracker.reset();
  }
}
