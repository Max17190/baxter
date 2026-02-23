import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { parseModelId } from "../src/config.js";

describe("parseModelId", () => {
  test("splits provider and model correctly", () => {
    const result = parseModelId("anthropic:claude-sonnet-4-20250514");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  test("handles provider with simple model name", () => {
    const result = parseModelId("openai:gpt-4o");
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
  });

  test("handles model names containing colons", () => {
    const result = parseModelId("openrouter:anthropic:claude-3-opus");
    expect(result.provider).toBe("openrouter");
    expect(result.model).toBe("anthropic:claude-3-opus");
  });

  test("handles minimal provider:model format", () => {
    const result = parseModelId("a:b");
    expect(result.provider).toBe("a");
    expect(result.model).toBe("b");
  });
});

describe("loadConfig", () => {
  // We need to isolate each loadConfig test since the module caches _config.
  // We use dynamic imports with cache-busting to work around this, but the
  // simplest approach is to test indirectly through behavior.

  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });

  test("throws when no provider is configured", async () => {
    // Clear all provider-related env vars
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.PRIMARY_MODEL;
    delete process.env.FAST_MODEL;
    delete process.env.LOG_LEVEL;
    delete process.env.CACHE_TTL_SECONDS;
    delete process.env.MAX_TOOL_CONCURRENCY;

    // Force fresh import to bypass the cached _config singleton
    const timestamp = Date.now();
    const configModule = await import(`../src/config.js?t=${timestamp}`);

    expect(() => configModule.loadConfig()).toThrow(
      "No LLM provider configured",
    );
  });

  test("applies default values when provider is set", async () => {
    // Set a single provider key
    process.env.ANTHROPIC_API_KEY = "test-key-for-defaults";
    // Clear other keys that might interfere
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.PRIMARY_MODEL;
    delete process.env.FAST_MODEL;
    delete process.env.LOG_LEVEL;
    delete process.env.CACHE_TTL_SECONDS;
    delete process.env.MAX_TOOL_CONCURRENCY;

    const timestamp = Date.now() + 1;
    const configModule = await import(`../src/config.js?t=${timestamp}`);
    const config = configModule.loadConfig();

    // Verify defaults are applied
    expect(config.primaryModel).toBe("anthropic:claude-sonnet-4-20250514");
    expect(config.fastModel).toBe("anthropic:claude-haiku-4-5-20251001");
    expect(config.logLevel).toBe("info");
    expect(config.cacheTtlSeconds).toBe(3600);
    expect(config.maxToolConcurrency).toBe(5);
    expect(config.langsmithProject).toBe("baxter");
    expect(config.anthropicApiKey).toBe("test-key-for-defaults");
    expect(config.bullBearEnabled).toBe(false);
  });
});
