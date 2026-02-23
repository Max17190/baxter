import { z } from "zod";
import type { ToolResult } from "../types.js";

/** Zod-native tool definition compatible with Vercel AI SDK */
// biome-ignore lint/suspicious/noExplicitAny: Covariant generic needed for tool registry
export interface ToolDefinition<TParams extends z.ZodType = z.ZodType<any>> {
  name: string;
  description: string;
  parameters: TParams;
  category: ToolCategory;
  cacheable?: boolean; // default true — set false for tools needing fresh data
  execute: (params: z.infer<TParams>) => Promise<ToolResult>;
}

export type ToolCategory = "firecrawl" | "finance" | "calculation" | "edgar" | "web";

/** Tool execution options */
export interface ToolExecutionOptions {
  maxConcurrency?: number;
  timeoutMs?: number;
  retries?: number;
}

/** Batch of tools to execute in parallel */
export interface ToolBatch {
  tools: Array<{
    name: string;
    params: unknown;
  }>;
  options?: ToolExecutionOptions;
}

/** Create a type-safe tool definition */
// biome-ignore lint/suspicious/noExplicitAny: Covariant generic needed for tool definitions
export function defineTool<TParams extends z.ZodType<any>>(
  def: ToolDefinition<TParams>,
): ToolDefinition<TParams> {
  return def;
}
