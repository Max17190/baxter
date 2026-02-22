import { describe, test, expect } from "bun:test";
import { TokenTracker } from "../src/llm/token-tracker.js";
import { CostTracker } from "../src/observability/cost-tracker.js";

describe("CostTracker", () => {
  test("getSessionSummary shows zero for new session", () => {
    const tt = new TokenTracker();
    const ct = new CostTracker(tt);
    const summary = ct.getSessionSummary();
    expect(summary).toContain("Queries run: 0");
    expect(summary).toContain("Total cost: $0.0000");
  });

  test("reset accumulates session totals", () => {
    const tt = new TokenTracker();
    const ct = new CostTracker(tt);

    // Simulate a query
    tt.record("anthropic", "claude-sonnet-4-20250514", 1000, 500);
    ct.reset();

    const summary = ct.getSessionSummary();
    expect(summary).toContain("Queries run: 1");
    expect(summary).not.toContain("Total cost: $0.0000");
  });

  test("session total accumulates across multiple resets", () => {
    const tt = new TokenTracker();
    const ct = new CostTracker(tt);

    // Query 1
    tt.record("anthropic", "claude-sonnet-4-20250514", 1000, 500);
    const cost1 = ct.getCost().totalUsd;
    ct.reset();

    // Query 2
    tt.record("anthropic", "claude-sonnet-4-20250514", 2000, 1000);
    const cost2 = ct.getCost().totalUsd;
    ct.reset();

    const summary = ct.getSessionSummary();
    expect(summary).toContain("Queries run: 2");
  });

  test("getSummary shows per-query breakdown", () => {
    const tt = new TokenTracker();
    const ct = new CostTracker(tt);

    tt.record("anthropic", "claude-sonnet-4-20250514", 1000, 500);
    const summary = ct.getSummary();

    expect(summary).toContain("Query cost:");
    expect(summary).toContain("By model:");
    expect(summary).toContain("claude-sonnet-4-20250514");
  });
});
