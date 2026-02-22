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
import { App } from "./ui/app.js";
import { registerFinanceTools } from "./tools/finance/register.js";
import { registerFirecrawlTools } from "./tools/firecrawl/register.js";
import { registerCalculationTools } from "./tools/calculation/register.js";
import type { SynthesizedAnswer } from "./types.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

async function main() {
  // Ensure runtime directory exists
  const baxterDir = join(process.cwd(), ".baxter");
  mkdirSync(baxterDir, { recursive: true });
  mkdirSync(join(baxterDir, "cache"), { recursive: true });
  mkdirSync(join(baxterDir, "logs"), { recursive: true });

  // Load and validate config
  const config = loadConfig();

  // Initialize core services
  const router = new ModelRouter(config);
  const tokenTracker = new TokenTracker();
  const costTracker = new CostTracker(tokenTracker);
  const memory = new Memory();

  // Register tools
  registerFinanceTools(config);
  registerFirecrawlTools(config);
  registerCalculationTools();

  // Load skills
  const skillRegistry = new SkillRegistry();
  const skills = await loadBuiltinSkills(process.cwd());
  skillRegistry.registerAll(skills);

  console.log(`Baxter initialized with ${toolRegistry.size} tools, ${skills.length} skills`);
  console.log(`Providers: ${router.providerRegistry.providers.join(", ")}`);
  console.log(`Primary: ${router.primaryModelName} | Fast: ${router.fastModelName}`);
  console.log("");

  // Handle query execution
  async function handleQuery(query: string): Promise<SynthesizedAnswer> {
    // Check for commands
    if (query.startsWith("/")) {
      return handleCommand(query);
    }

    const workspace = new Workspace(query);
    const bus = new MessageBus();

    // Wire bus to UI
    bus.on((event) => app.handleAgentEvent(event));

    const orchestrator = new Orchestrator({
      router,
      tokenTracker,
      toolRegistry,
      workspace,
      bus,
    });

    const answer = await orchestrator.run();

    // Persist to memory
    memory.storeFacts([...workspace.facts], query);
    memory.storeQuery({
      query,
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
