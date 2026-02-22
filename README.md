# Baxter

Autonomous financial research agent with a true multi-agent architecture. Ask any financial question and get a researched, sourced answer.

```
$ bun start
> Is NVDA overvalued? Do a DCF analysis.

Baxter classifies your query, builds a research plan, gathers data from
SEC EDGAR and financial APIs, runs bull/bear analysis in parallel,
validates the data, and synthesizes a comprehensive answer with tables
and citations.
```

## Why Baxter?

Most "multi-agent" financial tools are single ReAct loops pretending to be multiple agents. Baxter is different:

- **6 specialized agents** with distinct roles: Orchestrator, Planner, Researcher, Analyst, Validator, Synthesizer
- **Dynamic routing** -- simple lookups skip the planner; complex queries get the full pipeline with bull/bear debate
- **Task graph execution** -- the planner creates a dependency graph, and researchers execute tasks in parallel waves
- **Works with zero paid data keys** -- SEC EDGAR provides free financial data for all public US companies
- **Only 6 tools visible to the LLM** -- an agentic router dispatches to 14+ sub-tools internally, keeping the model focused

## Quick Start

```bash
# Install
bun install

# Set at least one LLM API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run
bun start

# Or with a direct query
bun start "What is AAPL's PE ratio?"
```

That's it. Baxter works immediately with free SEC EDGAR data. For richer data, add optional API keys:

```bash
# Optional: broader financial data (prices, insider trades, analyst estimates)
export FINANCIAL_DATASETS_API_KEY=...

# Optional: web research (news, earnings calls, qualitative data)
export FIRECRAWL_API_KEY=...
```

## Architecture

```
Query
  |
  v
Orchestrator (fast model classifies complexity + matches skills)
  |
  +--[simple]--> Researcher --> Synthesizer --> Answer
  |
  +--[medium]--> Planner --> Researcher (task graph) --> Analyst --> Synthesizer --> Answer
  |
  +--[complex]--> Planner --> Researcher (parallel waves) --> Analyst (bull + bear) --> Validator --> Synthesizer --> Answer
```

### Agents

| Agent | Role | Model |
|-------|------|-------|
| **Orchestrator** | Classify query complexity, match skills, route pipeline | Fast |
| **Planner** | Decompose into research tasks with dependency graph | Primary |
| **Researcher** | Execute tools to gather data (parallel waves) | Fast |
| **Analyst** | Financial analysis; bull/bear debate on complex queries | Primary |
| **Validator** | Cross-check facts, flag inconsistencies | Fast |
| **Synthesizer** | Generate final answer with citations and tables | Primary |

## Tools

The LLM sees only **6 tools**, keeping decisions focused and context efficient:

| Tool | Description | API Key? |
|------|-------------|----------|
| `financial_data` | Get any financial data. Agentic router dispatches to 14 sub-tools internally (income statements, balance sheets, cash flows, prices, metrics, SEC filings, insider trades, institutional holdings, analyst estimates, segment data, and 3 EDGAR endpoints). | No (EDGAR free) |
| `web_research` | Search the web or scrape a URL. Pass a query for search results with content, or a URL for markdown extraction. | Optional |
| `calculate_financial_ratios` | Compute PE, PB, ROE, ROA, margins, liquidity, and leverage ratios from raw data. | No |
| `calculate_growth_rates` | Compute CAGR, YoY growth, and sequential growth rates. | No |
| `calculate_statistics` | Compute mean, median, standard deviation, and percentiles. | No |
| `calculate_dcf` | Run a full DCF valuation with terminal value and sensitivity analysis. | No |

The `financial_data` tool uses a fast-model LLM call to route natural language like "AAPL income statements last 3 years" to the correct sub-tool. When no `FINANCIAL_DATASETS_API_KEY` is set, it falls back to free SEC EDGAR data automatically.

## Skills

7 built-in research skills activate automatically based on your query:

| Skill | Triggers |
|-------|----------|
| **DCF Valuation** | "dcf", "discounted cash flow", "intrinsic value", "fair value" |
| **Earnings Analysis** | "earnings", "quarterly results", "eps" |
| **Comparable Analysis** | "comparable", "comps", "peer comparison" |
| **Portfolio Review** | "portfolio", "holdings", "diversification" |
| **Risk Assessment** | "risk", "risk factors", "downside" |
| **SEC Filing Analysis** | "10-K", "10-Q", "SEC filing" |
| **Sector Analysis** | "sector", "industry analysis" |

Skills inject specialized prompts into the researcher and analyst agents, guiding tool usage and analytical frameworks.

## Features

- **Multi-turn conversations** -- follow-up queries resolved automatically ("What about their margins?" becomes "What are AAPL's margins?")
- **Cross-session memory** -- facts persist in SQLite across sessions; prior knowledge seeded into new queries
- **Structured table output** -- financial comparisons render as formatted tables in the TUI
- **Bull/bear debate** -- complex queries run dual analysts in parallel with opposing perspectives
- **Cost tracking** -- per-query and session-level cost breakdowns via `/cost`
- **Circuit breakers** -- external APIs fail fast after repeated errors
- **Tool result caching** -- LRU cache for cacheable tools (successful results only)
- **OpenTelemetry tracing** -- full pipeline observability when configured
- **Structured logging** -- Pino logging at all decision points

## TUI Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/cost` | Show session cost summary |
| `/history` | Show recent queries |
| `/skills` | List available research skills |
| `/debug` | Toggle workspace debug panel (or Ctrl+D) |
| `/clear` | Clear the conversation |

## Configuration

### LLM Providers

Set at least one API key. Baxter supports 7 providers:

| Provider | Environment Variable | Example Models |
|----------|---------------------|----------------|
| Anthropic | `ANTHROPIC_API_KEY` | Claude Sonnet, Haiku, Opus |
| OpenAI | `OPENAI_API_KEY` | GPT-4o, GPT-4.1, o3-mini |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini 2.5 Flash/Pro |
| xAI | `XAI_API_KEY` | Grok 3, Grok 3 Mini |
| DeepSeek | `DEEPSEEK_API_KEY` | DeepSeek Chat/Reasoner |
| OpenRouter | `OPENROUTER_API_KEY` | Any model via OpenRouter |
| Ollama | `OLLAMA_BASE_URL` | Local models |

### Model Selection

```bash
PRIMARY_MODEL=anthropic:claude-sonnet-4-20250514   # Reasoning, analysis, synthesis
FAST_MODEL=anthropic:claude-haiku-4-5-20251001     # Classification, routing, validation
```

### Optional Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `FINANCIAL_DATASETS_API_KEY` | -- | Unlock prices, insider trades, analyst estimates |
| `FIRECRAWL_API_KEY` | -- | Enable web research |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | -- | OpenTelemetry trace export URL |
| `LOG_LEVEL` | `info` | Log level (`trace` / `debug` / `info` / `warn` / `error`) |
| `CACHE_TTL_SECONDS` | `3600` | Tool result cache TTL |
| `MAX_TOOL_CONCURRENCY` | `5` | Max parallel tool executions |

## Development

```bash
bun dev              # Run with --watch
bun test             # Run 117 tests
bun run eval         # Run evaluation suite (20 financial Q&A pairs)
bun run lint         # Check with Biome
bun run lint:fix     # Auto-fix lint issues
bun run typecheck    # TypeScript type checking
```

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **LLM:** Vercel AI SDK (`ai` + provider packages)
- **Financial Data:** SEC EDGAR (free) + Financial Datasets API (optional)
- **Web Research:** Firecrawl (optional)
- **Validation:** Zod
- **Database:** SQLite (better-sqlite3)
- **TUI:** pi-tui
- **Observability:** Pino + OpenTelemetry
- **Linting:** Biome

## License

MIT
