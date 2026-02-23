import type { z } from "zod";
import type { ToolCategory, ToolDefinition } from "./types.js";
import { createCache } from "../utils/cache.js";
import type { ToolResult } from "../types.js";

// biome-ignore lint/suspicious/noExplicitAny: Registry stores heterogeneous tool types
type AnyToolDefinition = ToolDefinition<z.ZodType<any>>;

/** Source info from the most recent tool execution */
export interface ToolSourceInfo {
  sourceUrl?: string;
  sourceDescription?: string;
}

/** Central registry for all available tools */
export class ToolRegistry {
  private tools = new Map<string, AnyToolDefinition>();
  private cache = createCache<{ result: ToolResult }>({ maxSize: 200, ttlMs: 3600_000 });
  private _recentSources = new Map<string, ToolSourceInfo>();

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

  /** Convert tools to Vercel AI SDK format, with caching for cacheable tools */
  toAISDKTools(names?: string[]): Record<string, AISDKTool> {
    const result: Record<string, AISDKTool> = {};
    const toolsToConvert = names
      ? names.map((n) => this.getRequired(n))
      : this.getAll();

    for (const tool of toolsToConvert) {
      const isCacheable = tool.cacheable !== false; // default true
      result[tool.name] = {
        description: tool.description,
        parameters: tool.parameters,
        execute: async (params: z.infer<typeof tool.parameters>) => {
          if (isCacheable) {
            const cacheKey = `${tool.name}:${JSON.stringify(params)}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
              if (cached.result.sourceUrl || cached.result.sourceDescription) {
                this._recentSources.set(tool.name, { sourceUrl: cached.result.sourceUrl, sourceDescription: cached.result.sourceDescription });
              }
              return cached.result.data;
            }
            const toolResult = await tool.execute(params);
            if (toolResult.success) {
              this.cache.set(cacheKey, { result: toolResult });
            }
            if (toolResult.sourceUrl || toolResult.sourceDescription) {
              this._recentSources.set(tool.name, { sourceUrl: toolResult.sourceUrl, sourceDescription: toolResult.sourceDescription });
            }
            return toolResult.data;
          }
          const toolResult = await tool.execute(params);
          if (toolResult.sourceUrl || toolResult.sourceDescription) {
            this._recentSources.set(tool.name, { sourceUrl: toolResult.sourceUrl, sourceDescription: toolResult.sourceDescription });
          }
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

  /** Get the most recent source info for a tool and clear it */
  getRecentSource(toolName: string): ToolSourceInfo | undefined {
    const source = this._recentSources.get(toolName);
    if (source) this._recentSources.delete(toolName);
    return source;
  }
}

interface AISDKTool {
  description: string;
  parameters: z.ZodType;
  execute: (params: unknown) => Promise<unknown>;
}

/** Singleton registry instance */
export const toolRegistry = new ToolRegistry();
