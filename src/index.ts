#!/usr/bin/env bun

import { loadConfig } from "./config.js";
import { ModelRouter } from "./llm/router.js";
import { TokenTracker } from "./llm/token-tracker.js";
import { toolRegistry } from "./tools/registry.js";
import { Workspace } from "./agents/context/workspace.js";
import { MessageBus } from "./agents/context/message-bus.js";
import { Memory } from "./agents/context/memory.js";
import { Orchestrator } from "./agents/orchestrator.js";
import { CostTracker } from "./observability/cost-tracker.js";
import { SkillRegistry } from "./skills/registry.js";
import { loadBuiltinSkills } from "./skills/loader.js";
import { Conversation } from "./agents/context/conversation.js";
import { App } from "./ui/app.js";
import { registerCalculationTools } from "./tools/calculation/register.js";
import { createFinancialDataTool } from "./tools/financial-data.js";
import { createWebResearchTool } from "./tools/web-research.js";
import { createWebFetchTool } from "./tools/web-fetch.js";
import type { SynthesizedAnswer } from "./types.js";
import { createChildLogger } from "./utils/logger.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const log = createChildLogger("main");

async function main() {
  // Ensure runtime directory exists
  const baxterDir = join(process.cwd(), ".baxter");
  mkdirSync(baxterDir, { recursive: true });
  mkdirSync(join(baxterDir, "cache"), { recursive: true });
  mkdirSync(join(baxterDir, "logs"), { recursive: true });

  // Load and validate config
  const config = loadConfig();

  // Initialize OpenTelemetry if configured
  if (config.otelEndpoint) {
    try {
      const { NodeSDK } = await import("@opentelemetry/sdk-node");
      const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
      const { SimpleSpanProcessor } = await import("@opentelemetry/sdk-trace-base");

      const exporter = new OTLPTraceExporter({ url: `${config.otelEndpoint}/v1/traces` });
      const sdk = new NodeSDK({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
        serviceName: "baxter",
      });
      sdk.start();
      log.info({ endpoint: config.otelEndpoint }, "OpenTelemetry tracing enabled");
    } catch (err) {
      log.warn({ error: err instanceof Error ? err.message : String(err) }, "Failed to initialize OpenTelemetry");
    }
  }

  // Initialize core services
  const router = new ModelRouter(config);
  const tokenTracker = new TokenTracker();
  const costTracker = new CostTracker(tokenTracker);
  const memory = new Memory();

  // Register tools — consolidated for minimal LLM decision complexity
  // 1. financial_data: agentic router over 11 finance + 3 EDGAR sub-tools (always available via free EDGAR)
  toolRegistry.register(createFinancialDataTool({
    financialDatasetsApiKey: config.financialDatasetsApiKey,
    fastModel: router.fast,
  }));

  // 2. web_research: unified search + scrape (Firecrawl > Exa > Perplexity > Tavily)
  const hasWebSearch = config.firecrawlApiKey || config.exaApiKey || config.perplexityApiKey || config.tavilyApiKey;
  if (hasWebSearch) {
    toolRegistry.register(createWebResearchTool({
      firecrawlApiKey: config.firecrawlApiKey,
      exaApiKey: config.exaApiKey,
      perplexityApiKey: config.perplexityApiKey,
      tavilyApiKey: config.tavilyApiKey,
    }));
  } else {
    log.warn("No web search API key set — web research tool not available. Set FIRECRAWL_API_KEY, EXASEARCH_API_KEY, PERPLEXITY_API_KEY, or TAVILY_API_KEY.");
  }

  // 3. web_fetch: lightweight HTTP fetch (always available, no API key needed)
  toolRegistry.register(createWebFetchTool());

  // 4. Calculation tools: always available (local, no API needed)
  registerCalculationTools();

  if (!config.financialDatasetsApiKey) {
    log.warn("No FINANCIAL_DATASETS_API_KEY set — using free SEC EDGAR data only. Set it for broader coverage (prices, insider trades, analyst estimates, etc.).");
  }

  // Initialize conversation context
  const conversation = new Conversation();

  // Load skills
  const skillRegistry = new SkillRegistry();
  const skills = await loadBuiltinSkills(process.cwd());
  skillRegistry.registerAll(skills);

  log.info(
    { tools: toolRegistry.size, skills: skills.length, providers: router.providerRegistry.providers },
    "Baxter initialized",
  );
  log.info({ primary: router.primaryModelName, fast: router.fastModelName }, "Models configured");

  // Handle query execution
  async function handleQuery(query: string): Promise<SynthesizedAnswer> {
    // Check for commands
    if (query.startsWith("/")) {
      return handleCommand(query);
    }

    // Resolve follow-up queries using conversation context
    const resolvedQuery = await conversation.resolveFollowUp(query, router.fast);
    if (resolvedQuery !== query) {
      log.info({ original: query, resolved: resolvedQuery }, "Follow-up query resolved");
    }

    const workspace = new Workspace(resolvedQuery);
    const bus = new MessageBus();

    // Seed workspace with conversation context
    const convContext = conversation.buildContext();
    if (convContext) {
      workspace.setConversationContext(convContext);
    }

    // Seed workspace with prior facts from memory
    const priorFacts = memory.findFacts({ minConfidence: 0.7, limit: 20 });
    if (priorFacts.length > 0) {
      workspace.setPriorFacts(priorFacts);
      log.debug({ priorFacts: priorFacts.length }, "Seeded workspace with prior knowledge");
    }

    // Wire bus to UI
    bus.on((event) => app.handleAgentEvent(event));

    const orchestrator = new Orchestrator({
      router,
      tokenTracker,
      toolRegistry,
      workspace,
      bus,
      skillRegistry,
      memory,
    });

    const answer = await orchestrator.run();

    // Store conversation turn
    conversation.addTurn(resolvedQuery, answer.content.slice(0, 500), [...workspace.facts].slice(0, 10));

    // Persist to memory
    memory.storeFacts([...workspace.facts], resolvedQuery);
    memory.storeQuery({
      query: resolvedQuery,
      complexity: workspace.complexity,
      answer: answer.content,
      confidence: answer.confidence,
      costUsd: costTracker.getCost().totalUsd,
    });

    // Show cost
    console.log(costTracker.getSummary());
    costTracker.reset();

    return answer;
  }

  function handleCommand(cmd: string): SynthesizedAnswer {
    const command = cmd.trim().toLowerCase();

    switch (command) {
      case "/help":
        return {
          content: [
            "## Commands",
            "- `/help` — Show this help",
            "- `/cost` — Show cost tracking for this session",
            "- `/history` — Show recent queries",
            "- `/skills` — List available skills",
            "- `/debug` — Toggle workspace debug panel (or Ctrl+D)",
            "- `/clear` — Clear the conversation",
            "",
            "## Tips",
            "- Ask any financial question: \"What is AAPL's PE ratio?\"",
            "- Request analysis: \"Compare AAPL and MSFT margins\"",
            "- Trigger skills: \"Do a DCF for NVDA\"",
          ].join("\n"),
          citations: [],
          confidence: 1,
          factsUsed: [],
        };

      case "/skills":
        return {
          content: [
            "## Available Skills",
            ...skillRegistry.getAll().map((s) => `- **${s.name}**: ${s.description}`),
          ].join("\n"),
          citations: [],
          confidence: 1,
          factsUsed: [],
        };

      case "/cost":
        return {
          content: costTracker.getSessionSummary(),
          citations: [],
          confidence: 1,
          factsUsed: [],
        };

      case "/history": {
        const recent = memory.getRecentQueries(5);
        return {
          content: [
            "## Recent Queries",
            ...recent.map(
              (r) =>
                `- ${r.query}\n  ${r.answer?.slice(0, 100) ?? "(no answer)"}...`,
            ),
          ].join("\n"),
          citations: [],
          confidence: 1,
          factsUsed: [],
        };
      }

      default:
        return {
          content: `Unknown command: ${cmd}. Type /help for available commands.`,
          citations: [],
          confidence: 1,
          factsUsed: [],
        };
    }
  }

  // Start the TUI
  const app = new App({
    onQuery: handleQuery,
    onExit: () => {
      memory.close();
      process.exit(0);
    },
  });

  app.start();

  // If launched with a query argument, run it immediately
  const args = process.argv.slice(2);
  if (args.length > 0 && !args[0].startsWith("-")) {
    await app.submitQuery(args.join(" "));
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
