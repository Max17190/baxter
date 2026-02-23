# Baxter

Autonomous financial research agent. Ask any question about a public company and get a sourced, cited answer backed by real data.

```
$ bun start
> Is NVDA overvalued? Do a DCF analysis.

Baxter classifies your query, builds a research plan, gathers data from
SEC EDGAR and the web, runs a 2-round bull/bear debate, validates with
a reflexion loop, and synthesizes a comprehensive answer with tables
and citations.
```

```
                              Query
                                |
                                v
                    +---------------------+
                    |    Orchestrator      |
                    |  (fast model classifies
                    |   complexity + skills)
                    +---------------------+
                       |       |       |
              simple   |       |       |   complex
                       |       |       |
               +-------+   medium  +---+--------+
               |               |                 |
               v               v                 v
          Researcher      Planner            Planner
               |               |                 |
               |          task graph         task graph
               |               |                 |
               |          Researcher         Researcher
               |        (parallel waves)   (parallel waves)
               |               |                 |
               |          Analyst            Analyst
               |               |          (2-round bull/bear
               |               |              debate)
               |               |                 |
               |               |           Validator
               |               |        (reflexion loop)
               |               |                 |
               v               v                 v
                    +---------------------+
                    |    Synthesizer       |
                    |  (streaming answer   |
                    |   with citations)    |
                    +---------------------+
                                |
                                v
                            Answer
```

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [How to Install](#how-to-install)
4. [How to Run](#how-to-run)
5. [Agents](#agents)
6. [Tools](#tools)
7. [Skills](#skills)
8. [How to Evaluate](#how-to-evaluate)
9. [How to Debug](#how-to-debug)
10. [Configuration](#configuration)
11. [How to Contribute](#how-to-contribute)
12. [License](#license)

---

## Overview

Most financial AI tools are a single ReAct loop with a "research" label slapped on top. Baxter is a genuine multi-agent system: 6 specialized agents with distinct roles, a dependency-aware task graph, and dynamic routing that skips unnecessary work on simple queries while deploying the full pipeline on complex ones.

The interesting parts happen after the data is gathered. On complex queries, a bull analyst and a bear analyst independently build their cases, then each reads the other's argument and writes a rebuttal. That is two rounds of adversarial debate before the synthesizer ever sees the results. When the validator detects quality issues -- a data quality score below 0.7 or an outright error -- a reflexion loop kicks in. A fast model generates corrective guidance, only the affected research tasks re-run, the analyst re-processes, and the validator checks again. This adds zero cost when the data is already clean.

Everything streams through a terminal UI. You see which agent is running, watch facts accumulate in real time, and get a final answer with inline citations and formatted tables. Follow-up questions work naturally -- "What about their margins?" resolves to the company you were just discussing -- and facts persist across sessions in a local SQLite database.

Baxter works out of the box with zero paid data keys. SEC EDGAR provides free financial data for every public US company. Add optional API keys to unlock richer data sources and web search, but the core pipeline runs on a single LLM API key and nothing else.

## Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)
- At least one LLM API key (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)

That's it. Financial data is available immediately via free SEC EDGAR. Web search and premium financial data are optional.

## How to Install

Install Bun if you don't have it:

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"

# Homebrew
brew install oven-sh/bun/bun
```

Then clone and install dependencies:

```bash
git clone <repo-url> && cd baxter
bun install
```

Set at least one LLM API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## How to Run

Launch the interactive TUI:

```bash
bun start
```

Or pass a query directly:

```bash
bun start "What is AAPL's PE ratio?"
```

The TUI supports these commands:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/cost` | Show session cost summary |
| `/history` | Show recent queries |
| `/skills` | List available research skills |
| `/debug` | Toggle workspace debug panel (or `Ctrl+D`) |
| `/clear` | Clear the conversation |

## Agents

| Agent | Role | Model Tier |
|-------|------|------------|
| **Orchestrator** | Classify query complexity, match skills, route pipeline | Fast |
| **Planner** | Decompose query into research tasks with dependency graph | Primary |
| **Researcher** | Execute tools to gather data, runs tasks in parallel waves | Fast |
| **Analyst** | Financial analysis; 2-round iterative bull/bear debate on complex queries | Primary |
| **Validator** | Cross-check facts, flag inconsistencies; triggers reflexion if quality is low | Fast |
| **Synthesizer** | Generate final answer with citations and tables | Primary |

The orchestrator uses the fast model to classify queries into three complexity tiers. Each tier maps to a fixed pipeline:

- **Simple** -- single data point lookups skip straight to the researcher and synthesizer.
- **Medium** -- the planner creates a task graph, the researcher executes it in parallel waves, and the analyst provides a neutral assessment.
- **Complex** -- the full pipeline runs: task graph, parallel research, 2-round bull/bear debate, validator with reflexion, and synthesis.

### Iterative Debate

When bull/bear debate is enabled on complex queries:

1. **Round 1** -- Bull and bear analysts run independently in parallel.
2. **Round 2** -- Each analyst reads the opponent's Round 1 output and produces a targeted rebuttal.
3. The synthesizer receives all 4 perspectives for a balanced assessment.

### Reflexion Loop

When the validator finds significant issues (data quality score below 0.7 or severity "error"):

1. A fast model generates corrective guidance identifying which research tasks need re-running.
2. Only the affected tasks re-execute with reflection context.
3. The analyst re-runs with updated facts.
4. The validator checks again (up to 3 rounds, configurable).

This adds zero overhead when results are already good -- the validator simply passes through.

## Tools

The LLM sees 7 tools. An agentic router dispatches `financial_data` requests to 14 sub-tools internally, keeping the model's decision space small and focused.

| Tool | Description | API Key Required |
|------|-------------|-----------------|
| `financial_data` | Any financial data. Routes to 14 sub-tools: income statements, balance sheets, cash flows, prices, key metrics, SEC filings, insider trades, institutional holdings, analyst estimates, segment data, and 3 EDGAR endpoints. | No (EDGAR is free) |
| `web_research` | Search the web or scrape a URL. Supports Firecrawl, Exa, Perplexity, and Tavily backends (first available key wins). | Optional |
| `web_fetch` | Fetch and extract content from any URL using Readability. No API key required. | No |
| `calculate_financial_ratios` | PE, PB, ROE, ROA, margins, liquidity, and leverage ratios from raw data. | No |
| `calculate_growth_rates` | CAGR, YoY growth, and sequential growth rates. | No |
| `calculate_statistics` | Mean, median, standard deviation, and percentiles. | No |
| `calculate_dcf` | Full DCF valuation with terminal value and sensitivity analysis. | No |

The `financial_data` tool uses a fast-model LLM call to route natural language like "AAPL income statements last 3 years" to the correct sub-tool. When no `FINANCIAL_DATASETS_API_KEY` is set, it falls back to free SEC EDGAR data automatically.

## Skills

7 built-in research skills activate automatically based on trigger keywords in your query. Skills inject specialized prompts into the researcher and analyst, guiding tool usage and analytical frameworks.

| Skill | Triggers |
|-------|----------|
| DCF Valuation | "dcf", "discounted cash flow", "intrinsic value", "fair value" |
| Earnings Analysis | "earnings", "quarterly results", "eps" |
| Comparable Analysis | "comparable", "comps", "peer comparison" |
| Portfolio Review | "portfolio", "holdings", "diversification" |
| Risk Assessment | "risk", "risk factors", "downside" |
| SEC Filing Analysis | "10-K", "10-Q", "SEC filing" |
| Sector Analysis | "sector", "industry analysis" |

## How to Evaluate

Baxter includes an evaluation suite with 20 financial Q&A pairs scored by an LLM judge:

```bash
# Run the full suite
bun run eval

# Run a single eval by ID
bun run eval simple-pe

# Run evals by category
bun run eval lookup
```

## How to Debug

**Workspace panel** -- press `Ctrl+D` or type `/debug` to toggle a live view of the workspace: current facts, matched skills, task graph status, and validation issues.

**Log levels** -- set `LOG_LEVEL` to control verbosity:

```bash
LOG_LEVEL=debug bun start    # See routing decisions, tool calls, agent handoffs
LOG_LEVEL=trace bun start    # Everything, including raw LLM inputs/outputs
```

All logging is structured via Pino, so you can pipe output through `pino-pretty` or ship it to any log aggregator.

**OpenTelemetry** -- set `OTEL_EXPORTER_OTLP_ENDPOINT` to export traces covering the full pipeline, individual agent runs, and tool executions.

## Configuration

### LLM Providers

Set at least one API key. Baxter supports 8 providers:

| Provider | Environment Variable | Example Models |
|----------|---------------------|----------------|
| Anthropic | `ANTHROPIC_API_KEY` | Claude Sonnet, Haiku, Opus |
| OpenAI | `OPENAI_API_KEY` | GPT-4o, GPT-4.1, o3-mini |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini 2.5 Flash/Pro |
| xAI | `XAI_API_KEY` | Grok 3, Grok 4 |
| DeepSeek | `DEEPSEEK_API_KEY` | DeepSeek Chat/Reasoner |
| Moonshot | `MOONSHOT_API_KEY` | Kimi K2 |
| OpenRouter | `OPENROUTER_API_KEY` | Any model via OpenRouter |
| Ollama | `OLLAMA_BASE_URL` | Local models |

### Model Selection

Baxter uses two model tiers. The primary model handles reasoning-heavy tasks (planning, analysis, synthesis). The fast model handles classification, routing, validation, and tool dispatch.

```bash
PRIMARY_MODEL=anthropic:claude-sonnet-4-20250514
FAST_MODEL=anthropic:claude-haiku-4-5-20251001
```

### Optional Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `FINANCIAL_DATASETS_API_KEY` | -- | Unlock prices, insider trades, analyst estimates |
| `FIRECRAWL_API_KEY` | -- | Web search + scrape (highest priority) |
| `EXASEARCH_API_KEY` | -- | Exa neural search |
| `PERPLEXITY_API_KEY` | -- | Perplexity Sonar search |
| `TAVILY_API_KEY` | -- | Tavily search |
| `BULL_BEAR_ENABLED` | `false` | Enable 2-round iterative bull/bear debate |
| `REFLEXION_ENABLED` | `true` | Enable reflexion loop when validator finds issues |
| `MAX_REFLEXION_ROUNDS` | `1` | Max re-execution rounds (0-3) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | -- | OpenTelemetry trace export URL |
| `LOG_LEVEL` | `info` | Log level (trace / debug / info / warn / error) |
| `CACHE_TTL_SECONDS` | `3600` | Tool result cache TTL |
| `MAX_TOOL_CONCURRENCY` | `5` | Max parallel tool executions |

## How to Contribute

1. Fork the repository and create a feature branch.
2. Make your changes. Run `bun test` and `bun run lint` before submitting.
3. Open a pull request with a clear description of what changed and why.

Development commands:

```bash
bun dev              # Run with --watch
bun test             # Run all tests
bun run lint         # Check with Biome
bun run lint:fix     # Auto-fix lint issues
bun run typecheck    # TypeScript type checking
```

## License

MIT
