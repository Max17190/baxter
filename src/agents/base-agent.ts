import { generateText } from "ai";
import type { LanguageModelV1 } from "ai";
import { randomUUIDv7 } from "bun";
import type { Fact } from "../types.js";
import type { ModelRouter } from "../llm/router.js";
import type { TokenTracker } from "../llm/token-tracker.js";
import type { ToolRegistry, ToolSourceInfo } from "../tools/registry.js";
import type { Workspace } from "./context/workspace.js";
import type { MessageBus } from "./context/message-bus.js";
import type { AgentConfig, AgentOutput } from "./types.js";
import { parseModelId } from "../config.js";
import { createChildLogger } from "../utils/logger.js";
import { startAgentSpan, endSpan, endSpanWithError } from "../observability/tracer.js";

const log = createChildLogger("agent");

export interface BaseAgentDeps {
  router: ModelRouter;
  tokenTracker: TokenTracker;
  toolRegistry: ToolRegistry;
  workspace: Workspace;
  bus: MessageBus;
  skillRegistry?: import("../skills/registry.js").SkillRegistry;
  memory?: import("./context/memory.js").Memory;
}

/**
 * Base agent class with shared logic for all agents.
 * Uses Vercel AI SDK's generateText with tool loop (maxSteps).
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected deps: BaseAgentDeps;

  constructor(config: AgentConfig, deps: BaseAgentDeps) {
    this.config = config;
    this.deps = deps;
  }

  protected get model(): LanguageModelV1 {
    return this.deps.router.getModel(this.config.modelTier);
  }

  protected get modelName(): string {
    return this.config.modelTier === "fast"
      ? this.deps.router.fastModelName
      : this.deps.router.primaryModelName;
  }

  async run(): Promise<AgentOutput> {
    const start = performance.now();
    const { role } = this.config;
    const span = startAgentSpan(role, this.deps.workspace.query);

    log.info({ role, model: this.modelName }, "Agent starting");

    this.deps.bus.emit({
      type: "agent:start",
      agent: role,
      query: this.deps.workspace.query,
    });

    try {
      const context = this.getContext();
      const tools = this.config.tools
        ? this.deps.toolRegistry.toAISDKTools(this.config.tools)
        : {};

      const toolSources: Array<{ toolName: string } & ToolSourceInfo> = [];

      const result = await generateText({
        model: this.model,
        system: this.config.systemPrompt,
        prompt: context,
        tools,
        maxSteps: this.config.maxSteps ?? 5,
        onStepFinish: ({ text, toolCalls, toolResults }) => {
          if (text) {
            this.deps.bus.emit({ type: "agent:thinking", agent: role, content: text });
          }
          if (toolCalls) {
            for (const call of toolCalls) {
              this.deps.bus.emit({
                type: "agent:tool_call",
                agent: role,
                tool: call.toolName,
                params: call.args,
              });
              // Collect source info from the registry side-channel
              const source = this.deps.toolRegistry.getRecentSource(call.toolName);
              if (source) {
                toolSources.push({ toolName: call.toolName, ...source });
              }
            }
          }
          if (toolResults) {
            for (const res of toolResults) {
              this.deps.bus.emit({
                type: "agent:tool_result",
                agent: role,
                tool: res.toolName,
                success: res.result !== undefined,
                durationMs: 0,
              });
              // Also check after tool results in case source was set during execution
              const source = this.deps.toolRegistry.getRecentSource(res.toolName);
              if (source) {
                toolSources.push({ toolName: res.toolName, ...source });
              }
            }
          }
        },
      });

      // Track token usage
      if (result.usage) {
        const { provider, model } = parseModelId(this.modelName);
        this.deps.tokenTracker.record(
          provider,
          model,
          result.usage.promptTokens,
          result.usage.completionTokens,
        );
      }

      const durationMs = Math.round(performance.now() - start);
      const output = await this.processResult(result.text, result, toolSources);

      log.info({ role, durationMs, facts: output.facts?.length ?? 0, tokens: result.usage?.totalTokens }, "Agent completed");
      endSpan(span, { "agent.duration_ms": durationMs, "agent.facts": output.facts?.length ?? 0 });
      this.deps.bus.emit({ type: "agent:complete", agent: role, durationMs });

      return {
        role,
        facts: output.facts ?? [],
        rawOutput: result.text,
        plan: output.plan,
        answer: output.answer,
        durationMs,
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error({ role, durationMs, error: errorMsg }, "Agent failed");
      endSpanWithError(span, error instanceof Error ? error : new Error(errorMsg));
      this.deps.bus.emit({ type: "agent:error", agent: role, error: errorMsg });
      return {
        role,
        facts: [],
        rawOutput: "",
        durationMs,
      };
    }
  }

  /** Build context for this agent. Subclasses can override to append additional context. */
  protected getContext(): string {
    return this.deps.workspace.buildContextFor(this.config.role);
  }

  /** Create a fact with proper provenance */
  protected createFact(
    content: string,
    options: {
      tool?: string;
      confidence?: number;
      tags?: string[];
      sourceUrl?: string;
      sourceDescription?: string;
    } = {},
  ): Fact {
    const fact: Fact = {
      id: randomUUIDv7(),
      content,
      provenance: {
        agent: this.config.role,
        tool: options.tool,
        timestamp: Date.now(),
        sourceUrl: options.sourceUrl,
        sourceDescription: options.sourceDescription,
      },
      confidence: options.confidence ?? 0.8,
      tags: options.tags ?? [],
    };

    this.deps.bus.emit({ type: "agent:fact", agent: this.config.role, fact });
    return fact;
  }

  /** Subclasses implement this to process the LLM output */
  protected abstract processResult(
    text: string,
    fullResult: unknown,
    toolSources?: Array<{ toolName: string } & ToolSourceInfo>,
  ): Promise<Partial<AgentOutput>>;
}
