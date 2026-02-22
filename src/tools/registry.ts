import type { z } from "zod";
import type { ToolCategory, ToolDefinition } from "./types.js";

// biome-ignore lint/suspicious/noExplicitAny: Registry stores heterogeneous tool types
type AnyToolDefinition = ToolDefinition<z.ZodType<any>>;

/** Central registry for all available tools */
export class ToolRegistry {
  private tools = new Map<string, AnyToolDefinition>();

  // biome-ignore lint/suspicious/noExplicitAny: Accept any tool definition
  register(tool: ToolDefinition<any>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getRequired(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found in registry`);
    }
    return tool;
  }

  getByCategory(category: ToolCategory): ToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) => t.category === category);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** Convert tools to Vercel AI SDK format */
  toAISDKTools(names?: string[]): Record<string, AISDKTool> {
    const result: Record<string, AISDKTool> = {};
    const toolsToConvert = names
      ? names.map((n) => this.getRequired(n))
      : this.getAll();

    for (const tool of toolsToConvert) {
      result[tool.name] = {
        description: tool.description,
        parameters: tool.parameters,
        execute: async (params: z.infer<typeof tool.parameters>) => {
          const toolResult = await tool.execute(params);
          return toolResult.data;
        },
      };
    }
    return result;
  }

  get size(): number {
    return this.tools.size;
  }

  get names(): string[] {
    return Array.from(this.tools.keys());
  }
}

interface AISDKTool {
  description: string;
  parameters: z.ZodType;
  execute: (params: unknown) => Promise<unknown>;
}

/** Singleton registry instance */
export const toolRegistry = new ToolRegistry();
