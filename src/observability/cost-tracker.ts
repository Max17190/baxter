import type { TokenTracker } from "../llm/token-tracker.js";
import type { QueryCost } from "../types.js";

/** Formats and displays per-query cost breakdown */
export class CostTracker {
  private sessionTotalUsd = 0;
  private sessionTotalTokens = 0;
  private queryCount = 0;

  constructor(private tokenTracker: TokenTracker) {}

  /** Get formatted cost summary for the last query */
  getSummary(): string {
    const cost = this.tokenTracker.getQueryCost();
    const lines: string[] = [];

    lines.push(`Query cost: $${cost.totalUsd.toFixed(4)}`);
    lines.push(`Query tokens: ${this.tokenTracker.totalTokens.toLocaleString()}`);
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

  /** Get session-level cost summary for /cost command */
  getSessionSummary(): string {
    const lines: string[] = [];

    lines.push("## Session Cost Summary");
    lines.push("");
    lines.push(`Queries run: ${this.queryCount}`);
    lines.push(`Total cost: $${this.sessionTotalUsd.toFixed(4)}`);
    lines.push(`Total tokens: ${this.sessionTotalTokens.toLocaleString()}`);

    // Also show the current query breakdown if any tokens used
    if (this.tokenTracker.totalTokens > 0) {
      const cost = this.tokenTracker.getQueryCost();
      lines.push("");
      lines.push("Current/last query:");
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

  /** Reset for a new query — accumulates session totals first */
  reset(): void {
    const cost = this.tokenTracker.getQueryCost();
    this.sessionTotalUsd += cost.totalUsd;
    this.sessionTotalTokens += this.tokenTracker.totalTokens;
    this.queryCount++;
    this.tokenTracker.reset();
  }
}
