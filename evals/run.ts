#!/usr/bin/env bun

import { loadConfig } from "../src/config.js";
import { ModelRouter } from "../src/llm/router.js";
import { TokenTracker } from "../src/llm/token-tracker.js";
import { toolRegistry } from "../src/tools/registry.js";
import { Workspace } from "../src/agents/context/workspace.js";
import { MessageBus } from "../src/agents/context/message-bus.js";
import { Orchestrator } from "../src/agents/orchestrator.js";
import { CostTracker } from "../src/observability/cost-tracker.js";
import { SkillRegistry } from "../src/skills/registry.js";
import { loadBuiltinSkills } from "../src/skills/loader.js";
import { registerFinanceTools } from "../src/tools/finance/register.js";
import { registerFirecrawlTools } from "../src/tools/firecrawl/register.js";
import { registerCalculationTools } from "../src/tools/calculation/register.js";
import { registerEdgarTools } from "../src/tools/edgar/register.js";
import { evaluateAnswer, type EvalResult } from "./evaluator.js";
import dataset from "./dataset.json";

async function main() {
  const config = loadConfig();
  const router = new ModelRouter(config);
  const tokenTracker = new TokenTracker();
  const costTracker = new CostTracker(tokenTracker);

  // Register tools
  registerFinanceTools(config);
  registerFirecrawlTools(config);
  registerCalculationTools();
  registerEdgarTools();

  // Load skills
  const skillRegistry = new SkillRegistry();
  const skills = await loadBuiltinSkills(process.cwd());
  skillRegistry.registerAll(skills);

  console.log(`\nBaxter Evaluation Suite`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Dataset: ${dataset.length} queries`);
  console.log(`Model: ${router.primaryModelName} / ${router.fastModelName}`);
  console.log("");

  // Optionally filter by category or id via CLI args
  const filter = process.argv[2];
  const queries = filter
    ? dataset.filter((d) => d.id === filter || d.category === filter)
    : dataset;

  if (queries.length === 0) {
    console.log(`No matching queries found for filter: ${filter}`);
    process.exit(1);
  }

  const results: EvalResult[] = [];

  for (const item of queries) {
    console.log(`\n[${"#".repeat(40)}]`);
    console.log(`Running: ${item.id}`);
    console.log(`Query: "${item.query}"`);
    console.log(`Expected: ${item.expectedComplexity} | Tools: ${item.expectedTools.join(", ")}`);

    const start = performance.now();
    const workspace = new Workspace(item.query);
    const bus = new MessageBus();
    const toolsUsed: string[] = [];

    bus.on((event) => {
      if (event.type === "agent:tool_call") {
        toolsUsed.push(event.tool);
      }
    });

    try {
      tokenTracker.reset();

      const orchestrator = new Orchestrator({
        router,
        tokenTracker,
        toolRegistry,
        workspace,
        bus,
        skillRegistry,
      });

      const answer = await orchestrator.run();
      const latencyMs = Math.round(performance.now() - start);
      const costUsd = costTracker.getCost().totalUsd;

      // Evaluate with LLM judge
      const evalResult = await evaluateAnswer(
        router.primary,
        item.query,
        answer.content,
        item.expectedFacts,
      );

      results.push({
        id: item.id,
        query: item.query,
        score: evalResult.score,
        reasoning: evalResult.reasoning,
        factsCovered: evalResult.factsCovered,
        factsMissing: evalResult.factsMissing,
        latencyMs,
        costUsd,
        toolsUsed: [...new Set(toolsUsed)],
        complexity: workspace.complexity ?? "unknown",
      });

      console.log(`  Score: ${evalResult.score}/5`);
      console.log(`  Latency: ${(latencyMs / 1000).toFixed(1)}s | Cost: $${costUsd.toFixed(4)}`);
      console.log(`  Complexity: ${workspace.complexity} (expected: ${item.expectedComplexity})`);
      console.log(`  Tools: ${[...new Set(toolsUsed)].join(", ")}`);
      console.log(`  Facts covered: ${evalResult.factsCovered.join(", ")}`);
      if (evalResult.factsMissing.length > 0) {
        console.log(`  Facts MISSING: ${evalResult.factsMissing.join(", ")}`);
      }
    } catch (error) {
      const latencyMs = Math.round(performance.now() - start);
      console.log(`  ERROR: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        id: item.id,
        query: item.query,
        score: 0,
        reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
        factsCovered: [],
        factsMissing: item.expectedFacts,
        latencyMs,
        costUsd: 0,
        toolsUsed,
        complexity: "error",
      });
    }

    costTracker.reset();
  }

  // Print summary
  printSummary(results);
}

function printSummary(results: EvalResult[]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log("EVALUATION SUMMARY");
  console.log(`${"=".repeat(60)}\n`);

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  const passed = results.filter((r) => r.score >= 3.5).length;

  console.log(`Queries: ${results.length}`);
  console.log(`Average score: ${avgScore.toFixed(2)}/5`);
  console.log(`Pass rate (>=3.5): ${passed}/${results.length} (${((passed / results.length) * 100).toFixed(0)}%)`);
  console.log(`Average latency: ${(avgLatency / 1000).toFixed(1)}s`);
  console.log(`Total cost: $${totalCost.toFixed(4)}`);

  // Markdown table
  console.log("\n| ID | Score | Latency | Cost | Complexity |");
  console.log("|---|---|---|---|---|");
  for (const r of results) {
    const scoreEmoji = r.score >= 4 ? "+" : r.score >= 3 ? "~" : "-";
    console.log(
      `| ${r.id} | ${scoreEmoji} ${r.score}/5 | ${(r.latencyMs / 1000).toFixed(1)}s | $${r.costUsd.toFixed(4)} | ${r.complexity} |`,
    );
  }

  console.log(`\nResult: ${avgScore >= 3.5 ? "PASS" : "FAIL"} (target: 3.5/5 average)`);
}

main().catch((error) => {
  console.error("Eval runner error:", error);
  process.exit(1);
});
