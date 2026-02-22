import type { LanguageModelV1 } from "ai";
import type { Config } from "../config.js";
import type { ModelTier } from "../types.js";
import { ProviderRegistry } from "./provider-registry.js";

/** Routes requests to fast or primary model based on task requirements */
export class ModelRouter {
  private registry: ProviderRegistry;
  private primaryModelId: string;
  private fastModelId: string;

  constructor(config: Config) {
    this.registry = new ProviderRegistry(config);
    this.primaryModelId = config.primaryModel;
    this.fastModelId = config.fastModel;
  }

  /** Get the appropriate model for a given tier */
  getModel(tier: ModelTier): LanguageModelV1 {
    const modelId = tier === "fast" ? this.fastModelId : this.primaryModelId;
    return this.registry.resolve(modelId);
  }

  /** Get model by explicit ID */
  getModelById(modelId: string): LanguageModelV1 {
    return this.registry.resolve(modelId);
  }

  /** Get the primary model (reasoning, synthesis) */
  get primary(): LanguageModelV1 {
    return this.getModel("primary");
  }

  /** Get the fast model (classification, validation) */
  get fast(): LanguageModelV1 {
    return this.getModel("fast");
  }

  get primaryModelName(): string {
    return this.primaryModelId;
  }

  get fastModelName(): string {
    return this.fastModelId;
  }

  get providerRegistry(): ProviderRegistry {
    return this.registry;
  }
}
