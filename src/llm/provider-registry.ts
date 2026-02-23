import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModelV1 } from "ai";
import type { Config } from "../config.js";
import { parseModelId } from "../config.js";

type ProviderFactory = (config: Config) => LanguageModelV1Factory | null;

interface LanguageModelV1Factory {
  (modelId: string): LanguageModelV1;
}

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  openai: (config) => {
    if (!config.openaiApiKey) return null;
    const provider = createOpenAI({ apiKey: config.openaiApiKey });
    return (model: string) => provider(model);
  },

  anthropic: (config) => {
    if (!config.anthropicApiKey) return null;
    const provider = createAnthropic({
      apiKey: config.anthropicApiKey,
      headers: {
        "anthropic-beta": "token-efficient-tool-use-2025-04-14",
      },
    });
    return (model: string) => provider(model);
  },

  google: (config) => {
    if (!config.googleApiKey) return null;
    const provider = createGoogleGenerativeAI({ apiKey: config.googleApiKey });
    return (model: string) => provider(model);
  },

  xai: (config) => {
    if (!config.xaiApiKey) return null;
    const provider = createXai({ apiKey: config.xaiApiKey });
    return (model: string) => provider(model);
  },

  deepseek: (config) => {
    if (!config.deepseekApiKey) return null;
    const provider = createOpenAI({
      apiKey: config.deepseekApiKey,
      baseURL: "https://api.deepseek.com/v1",
    });
    return (model: string) => provider(model);
  },

  openrouter: (config) => {
    if (!config.openrouterApiKey) return null;
    const provider = createOpenAI({
      apiKey: config.openrouterApiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return (model: string) => provider(model);
  },

  ollama: (config) => {
    if (!config.ollamaBaseUrl) return null;
    const provider = createOpenAI({
      apiKey: "ollama",
      baseURL: `${config.ollamaBaseUrl}/v1`,
    });
    return (model: string) => provider(model);
  },
};

/** Registry that resolves provider:model strings to Vercel AI SDK model instances */
export class ProviderRegistry {
  private factories = new Map<string, LanguageModelV1Factory>();

  constructor(config: Config) {
    for (const [name, factory] of Object.entries(PROVIDER_FACTORIES)) {
      const instance = factory(config);
      if (instance) {
        this.factories.set(name, instance);
      }
    }
  }

  /** Resolve a "provider:model" string to a LanguageModelV1 instance */
  resolve(modelId: string): LanguageModelV1 {
    const { provider, model } = parseModelId(modelId);
    const factory = this.factories.get(provider);
    if (!factory) {
      const available = Array.from(this.factories.keys()).join(", ");
      throw new Error(
        `Provider "${provider}" not available. Configured providers: ${available}`,
      );
    }
    return factory(model);
  }

  /** Check if a provider is configured */
  hasProvider(name: string): boolean {
    return this.factories.has(name);
  }

  /** List all configured provider names */
  get providers(): string[] {
    return Array.from(this.factories.keys());
  }
}
