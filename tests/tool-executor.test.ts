import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { ToolRegistry } from "../src/tools/registry.js";
import { ToolExecutor } from "../src/tools/executor.js";

function createTestRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    name: "fast_tool",
    description: "Completes instantly",
    parameters: z.object({ value: z.number() }),
    category: "calculation",
    execute: async (params) => ({
      toolName: "fast_tool",
      success: true,
      data: { doubled: params.value * 2 },
      durationMs: 1,
    }),
  });

  registry.register({
    name: "slow_tool",
    description: "Takes a while",
    parameters: z.object({ delayMs: z.number() }),
    category: "calculation",
    execute: async (params) => {
      await new Promise((r) => setTimeout(r, params.delayMs));
      return {
        toolName: "slow_tool",
        success: true,
        data: { waited: params.delayMs },
        durationMs: params.delayMs,
      };
    },
  });

  registry.register({
    name: "failing_tool",
    description: "Always throws",
    parameters: z.object({}),
    category: "calculation",
    execute: async () => {
      throw new Error("Intentional failure");
    },
  });

  return registry;
}

describe("ToolExecutor", () => {
  describe("parallel execution", () => {
    test("executes multiple tools and returns all results", async () => {
      const registry = createTestRegistry();
      const executor = new ToolExecutor(registry);

      const results = await executor.execute([
        { name: "fast_tool", params: { value: 5 } },
        { name: "fast_tool", params: { value: 10 } },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].data).toEqual({ doubled: 10 });
      expect(results[1].success).toBe(true);
      expect(results[1].data).toEqual({ doubled: 20 });
    });

    test("executes tools concurrently (not sequentially)", async () => {
      const registry = createTestRegistry();
      const executor = new ToolExecutor(registry);

      const start = performance.now();
      const results = await executor.execute(
        [
          { name: "slow_tool", params: { delayMs: 100 } },
          { name: "slow_tool", params: { delayMs: 100 } },
          { name: "slow_tool", params: { delayMs: 100 } },
        ],
        { maxConcurrency: 3, retries: 0 },
      );
      const elapsed = performance.now() - start;

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      // If sequential, would take ~300ms. Parallel should take ~100ms.
      // Use generous threshold to avoid flaky tests.
      expect(elapsed).toBeLessThan(250);
    });
  });

  describe("timeout handling", () => {
    test("returns error when tool exceeds timeout", async () => {
      const registry = createTestRegistry();
      const executor = new ToolExecutor(registry);

      const results = await executor.execute(
        [{ name: "slow_tool", params: { delayMs: 5000 } }],
        { timeoutMs: 50, retries: 0 },
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("timed out");
    });
  });

  describe("unknown tool returns error", () => {
    test("returns error result for unregistered tool name", async () => {
      const registry = createTestRegistry();
      const executor = new ToolExecutor(registry);

      const results = await executor.execute([
        { name: "nonexistent_tool", params: {} },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('"nonexistent_tool" not found');
      expect(results[0].toolName).toBe("nonexistent_tool");
      expect(results[0].durationMs).toBe(0);
    });
  });

  describe("parameter validation", () => {
    test("returns error when parameters fail validation", async () => {
      const registry = createTestRegistry();
      const executor = new ToolExecutor(registry);

      const results = await executor.execute([
        { name: "fast_tool", params: { value: "not_a_number" } },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("Invalid parameters");
      expect(results[0].durationMs).toBe(0);
    });

    test("returns error when required parameters are missing", async () => {
      const registry = createTestRegistry();
      const executor = new ToolExecutor(registry);

      const results = await executor.execute([
        { name: "fast_tool", params: {} },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("Invalid parameters");
    });
  });

  describe("error handling with retries", () => {
    test("retries and still returns error if all attempts fail", async () => {
      const registry = createTestRegistry();
      const executor = new ToolExecutor(registry);

      const results = await executor.execute(
        [{ name: "failing_tool", params: {} }],
        { retries: 1 },
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe("Intentional failure");
      expect(results[0].toolName).toBe("failing_tool");
    });
  });
});
