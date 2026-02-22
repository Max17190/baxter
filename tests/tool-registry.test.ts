import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { ToolRegistry } from "../src/tools/registry.js";
import type { ToolDefinition } from "../src/tools/types.js";

function makeTool(
  name: string,
  category: "firecrawl" | "finance" | "calculation" = "calculation",
): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: z.object({ input: z.string() }),
    category,
    execute: async (params) => ({
      toolName: name,
      success: true,
      data: params,
      durationMs: 0,
    }),
  };
}

describe("ToolRegistry", () => {
  describe("register + get", () => {
    test("registers and retrieves a tool by name", () => {
      const registry = new ToolRegistry();
      const tool = makeTool("test_tool");
      registry.register(tool);

      const retrieved = registry.get("test_tool");
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe("test_tool");
      expect(retrieved!.description).toBe("Test tool: test_tool");
    });

    test("returns undefined for unregistered tool name", () => {
      const registry = new ToolRegistry();
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    test("getRequired throws for missing tool", () => {
      const registry = new ToolRegistry();
      expect(() => registry.getRequired("nonexistent")).toThrow(
        'Tool "nonexistent" not found in registry',
      );
    });

    test("tracks size correctly", () => {
      const registry = new ToolRegistry();
      expect(registry.size).toBe(0);
      registry.register(makeTool("tool_a"));
      expect(registry.size).toBe(1);
      registry.register(makeTool("tool_b"));
      expect(registry.size).toBe(2);
    });

    test("names returns all registered tool names", () => {
      const registry = new ToolRegistry();
      registry.register(makeTool("alpha"));
      registry.register(makeTool("beta"));
      registry.register(makeTool("gamma"));
      expect(registry.names).toEqual(["alpha", "beta", "gamma"]);
    });
  });

  describe("duplicate registration throws", () => {
    test("throws when registering a tool with the same name twice", () => {
      const registry = new ToolRegistry();
      registry.register(makeTool("dup_tool"));
      expect(() => registry.register(makeTool("dup_tool"))).toThrow(
        'Tool "dup_tool" is already registered',
      );
    });
  });

  describe("getByCategory", () => {
    test("returns only tools matching the category", () => {
      const registry = new ToolRegistry();
      registry.register(makeTool("calc_1", "calculation"));
      registry.register(makeTool("calc_2", "calculation"));
      registry.register(makeTool("fin_1", "finance"));
      registry.register(makeTool("crawl_1", "firecrawl"));

      const calcTools = registry.getByCategory("calculation");
      expect(calcTools).toHaveLength(2);
      expect(calcTools.map((t) => t.name).sort()).toEqual(["calc_1", "calc_2"]);

      const financeTools = registry.getByCategory("finance");
      expect(financeTools).toHaveLength(1);
      expect(financeTools[0].name).toBe("fin_1");
    });

    test("returns empty array when no tools match", () => {
      const registry = new ToolRegistry();
      registry.register(makeTool("calc_1", "calculation"));
      expect(registry.getByCategory("firecrawl")).toHaveLength(0);
    });
  });

  describe("toAISDKTools", () => {
    test("converts all tools to AI SDK format", () => {
      const registry = new ToolRegistry();
      registry.register(makeTool("tool_a"));
      registry.register(makeTool("tool_b"));

      const sdkTools = registry.toAISDKTools();
      expect(Object.keys(sdkTools)).toEqual(["tool_a", "tool_b"]);
      expect(sdkTools.tool_a.description).toBe("Test tool: tool_a");
      expect(typeof sdkTools.tool_a.execute).toBe("function");
    });

    test("converts only named tools when names are provided", () => {
      const registry = new ToolRegistry();
      registry.register(makeTool("tool_a"));
      registry.register(makeTool("tool_b"));
      registry.register(makeTool("tool_c"));

      const sdkTools = registry.toAISDKTools(["tool_a", "tool_c"]);
      expect(Object.keys(sdkTools).sort()).toEqual(["tool_a", "tool_c"]);
    });

    test("throws when a named tool does not exist", () => {
      const registry = new ToolRegistry();
      registry.register(makeTool("tool_a"));

      expect(() => registry.toAISDKTools(["tool_a", "nonexistent"])).toThrow(
        'Tool "nonexistent" not found in registry',
      );
    });

    test("execute function on AI SDK tool returns data from the tool result", async () => {
      const registry = new ToolRegistry();
      registry.register({
        name: "echo",
        description: "Echoes input",
        parameters: z.object({ message: z.string() }),
        category: "calculation",
        execute: async (params) => ({
          toolName: "echo",
          success: true,
          data: { echoed: params.message },
          durationMs: 1,
        }),
      });

      const sdkTools = registry.toAISDKTools();
      const result = await sdkTools.echo.execute({ message: "hello" });
      expect(result).toEqual({ echoed: "hello" });
    });
  });
});
