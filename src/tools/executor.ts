import pLimit from "p-limit";
import type { ToolResult } from "../types.js";
import type { ToolRegistry } from "./registry.js";
import type { ToolExecutionOptions } from "./types.js";

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 1;

/** Execute multiple tools in parallel with concurrency control */
export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  async execute(
    calls: Array<{ name: string; params: unknown }>,
    options: ToolExecutionOptions = {},
  ): Promise<ToolResult[]> {
    const {
      maxConcurrency = DEFAULT_CONCURRENCY,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      retries = DEFAULT_RETRIES,
    } = options;

    const limit = pLimit(maxConcurrency);

    const promises = calls.map((call) =>
      limit(() => this.executeOne(call.name, call.params, timeoutMs, retries)),
    );

    return Promise.all(promises);
  }

  private async executeOne(
    name: string,
    params: unknown,
    timeoutMs: number,
    retries: number,
  ): Promise<ToolResult> {
    const tool = this.registry.get(name);
    if (!tool) {
      return {
        toolName: name,
        success: false,
        error: `Tool "${name}" not found`,
        durationMs: 0,
      };
    }

    // Validate params
    const parseResult = tool.parameters.safeParse(params);
    if (!parseResult.success) {
      return {
        toolName: name,
        success: false,
        error: `Invalid parameters: ${parseResult.error.message}`,
        durationMs: 0,
      };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      const start = performance.now();
      try {
        const result = await Promise.race([
          tool.execute(parseResult.data),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool "${name}" timed out after ${timeoutMs}ms`)), timeoutMs),
          ),
        ]);
        return result;
      } catch (error) {
        const durationMs = Math.round(performance.now() - start);
        if (attempt === retries) {
          return {
            toolName: name,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs,
          };
        }
        // Wait before retry with exponential backoff
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }

    // Unreachable but satisfies TypeScript
    return { toolName: name, success: false, error: "Unexpected", durationMs: 0 };
  }
}
