import { z } from "zod";

const modelIdSchema = z
  .string()
  .regex(/^[\w-]+:[\w.-]+$/, "Model ID must be in format 'provider:model-name'");

const configSchema = z.object({
  // LLM providers
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  googleApiKey: z.string().optional(),
  xaiApiKey: z.string().optional(),
  deepseekApiKey: z.string().optional(),
  openrouterApiKey: z.string().optional(),
  ollamaBaseUrl: z.string().url().optional(),

  // Model selection
  primaryModel: modelIdSchema.default("anthropic:claude-sonnet-4-20250514"),
  fastModel: modelIdSchema.default("anthropic:claude-haiku-4-5-20251001"),

  // Financial data
  financialDatasetsApiKey: z.string().optional(),

  // Web research
  firecrawlApiKey: z.string().optional(),

  // Observability
  langsmithApiKey: z.string().optional(),
  langsmithProject: z.string().default("baxter"),
  otelEndpoint: z.string().url().optional(),

  // General
  logLevel: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  cacheTtlSeconds: z.coerce.number().int().positive().default(3600),
  maxToolConcurrency: z.coerce.number().int().min(1).max(20).default(5),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function loadConfig(): Config {
  if (_config) return _config;

  const env = Bun.env;
  const raw = {
    openaiApiKey: env.OPENAI_API_KEY,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    xaiApiKey: env.XAI_API_KEY,
    deepseekApiKey: env.DEEPSEEK_API_KEY,
    openrouterApiKey: env.OPENROUTER_API_KEY,
    ollamaBaseUrl: env.OLLAMA_BASE_URL,
    primaryModel: env.PRIMARY_MODEL,
    fastModel: env.FAST_MODEL,
    financialDatasetsApiKey: env.FINANCIAL_DATASETS_API_KEY,
    firecrawlApiKey: env.FIRECRAWL_API_KEY,
    langsmithApiKey: env.LANGSMITH_API_KEY,
    langsmithProject: env.LANGSMITH_PROJECT,
    otelEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    logLevel: env.LOG_LEVEL,
    cacheTtlSeconds: env.CACHE_TTL_SECONDS,
    maxToolConcurrency: env.MAX_TOOL_CONCURRENCY,
  };

  // Strip undefined values so defaults apply
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined),
  );

  const result = configSchema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  // Verify at least one LLM provider is configured
  const cfg = result.data;
  const hasProvider =
    cfg.openaiApiKey ||
    cfg.anthropicApiKey ||
    cfg.googleApiKey ||
    cfg.xaiApiKey ||
    cfg.deepseekApiKey ||
    cfg.openrouterApiKey ||
    cfg.ollamaBaseUrl;

  if (!hasProvider) {
    throw new Error(
      "No LLM provider configured. Set at least one API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)",
    );
  }

  _config = cfg;
  return cfg;
}

export function parseModelId(modelId: string): { provider: string; model: string } {
  const [provider, ...rest] = modelId.split(":");
  return { provider, model: rest.join(":") };
}
