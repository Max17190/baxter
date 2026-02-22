import type { TokenUsage, QueryCost } from "../types.js";

/** Per-model pricing in USD per 1M tokens */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
  "claude-opus-4-20250514": { input: 15.0, output: 75.0 },
  // OpenAI
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "o3-mini": { input: 1.1, output: 4.4 },
  // Google
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
  // xAI
  "grok-3": { input: 3.0, output: 15.0 },
  "grok-3-mini": { input: 0.3, output: 0.5 },
  // DeepSeek
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
};

export class TokenTracker {
  private usages: TokenUsage[] = [];

  record(provider: string, model: string, promptTokens: number, completionTokens: number): void {
    const pricing = MODEL_PRICING[model] ?? { input: 1.0, output: 3.0 };
    const estimatedCostUsd =
      (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;

    this.usages.push({
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd,
    });
  }

  getQueryCost(): QueryCost {
    const byAgent: Record<string, TokenUsage> = {};
    const byModel: Record<string, TokenUsage> = {};
    let totalUsd = 0;

    for (const usage of this.usages) {
      totalUsd += usage.estimatedCostUsd;

      // Aggregate by model
      const existing = byModel[usage.model];
      if (existing) {
        existing.promptTokens += usage.promptTokens;
        existing.completionTokens += usage.completionTokens;
        existing.totalTokens += usage.totalTokens;
        existing.estimatedCostUsd += usage.estimatedCostUsd;
      } else {
        byModel[usage.model] = { ...usage };
      }
    }

    return { totalUsd, byAgent, byModel };
  }

  get totalCostUsd(): number {
    return this.usages.reduce((sum, u) => sum + u.estimatedCostUsd, 0);
  }

  get totalTokens(): number {
    return this.usages.reduce((sum, u) => sum + u.totalTokens, 0);
  }

  reset(): void {
    this.usages = [];
  }
}
