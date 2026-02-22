# Baxter

**The best autonomous financial research agent.**

Baxter is a multi-agent system that answers complex financial questions by orchestrating specialized AI agents, financial data APIs, and web research tools.

## Architecture

```
User Query
    |
[Orchestrator] -> classifies query complexity (fast model)
    |
    +- simple  -> Researcher -> Synthesizer
    +- medium  -> Planner -> Researcher -> Analyst -> Synthesizer
    +- complex -> Planner -> Researcher -> Analyst -> Validator -> Synthesizer
```

### Agents

| Agent | Role | Model |
|-------|------|-------|
| **Orchestrator** | Classify query complexity, route pipeline | Fast |
| **Planner** | Decompose into research tasks with dependencies | Primary |
| **Researcher** | Execute tools to gather data (parallel) | Fast |
| **Analyst** | Financial calculations, skill invocation | Primary |
| **Validator** | Cross-check facts, flag inconsistencies | Fast |
| **Synthesizer** | Generate final answer with citations | Primary |

### Key Features

- **Real multi-agent architecture** — 6 specialized agents with dynamic routing
- **20+ tools** — 11 financial data tools, 5 web research tools, 4 local computation tools
- **7 built-in skills** — DCF valuation, comparable analysis, earnings analysis, risk assessment, sector analysis, SEC filing analysis, portfolio review
- **Parallel tool execution** — independent tools fire simultaneously with concurrency control
- **Dual model routing** — fast model for classification/validation, primary for reasoning/synthesis
- **Structured workspace** — typed shared state with fact provenance and confidence tracking
- **SQLite persistence** — cross-session memory for facts and query history
- **Cost tracking** — per-query cost breakdown by model

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-org/baxter.git
cd baxter
bun install

# Configure (at least one LLM provider required)
cp env.example .env
# Edit .env with your API keys

# Run
bun start

# Or with a direct query
bun start "What is AAPL's PE ratio?"
```

## Configuration

Copy `env.example` to `.env` and set your API keys:

```bash
# Required: At least one LLM provider
ANTHROPIC_API_KEY=sk-ant-...     # Recommended
OPENAI_API_KEY=sk-...            # Alternative

# Optional: Financial data
FINANCIAL_DATASETS_API_KEY=...   # For financial statements, prices, etc.

# Optional: Web research
FIRECRAWL_API_KEY=fc-...         # For web search and scraping

# Model selection (defaults shown)
PRIMARY_MODEL=anthropic:claude-sonnet-4-20250514
FAST_MODEL=anthropic:claude-haiku-4-5-20251001
```

### Supported LLM Providers

| Provider | Env Variable | Models |
|----------|-------------|--------|
| Anthropic | `ANTHROPIC_API_KEY` | Claude Sonnet, Haiku, Opus |
| OpenAI | `OPENAI_API_KEY` | GPT-4o, GPT-4.1, o3-mini |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini 2.5 Flash/Pro |
| xAI | `XAI_API_KEY` | Grok 3, Grok 3 Mini |
| DeepSeek | `DEEPSEEK_API_KEY` | DeepSeek Chat/Reasoner |
| OpenRouter | `OPENROUTER_API_KEY` | Any model via OpenRouter |
| Ollama | `OLLAMA_BASE_URL` | Local models |

## Tools

### Financial Data (via Financial Datasets API)
- `get_income_statements` — Revenue, net income, EPS
- `get_balance_sheets` — Assets, liabilities, equity
- `get_cash_flows` — Operating, investing, financing cash flows
- `get_prices` — Historical stock prices
- `get_key_metrics` — PE ratio, ROE, margins, etc.
- `get_sec_filings` — SEC filing metadata
- `get_insider_trades` — Insider buying/selling
- `get_institutional_holdings` — Institutional ownership
- `get_analyst_estimates` — Consensus estimates
- `get_segmented_financials` — Segment breakdowns
- `search_financial_data` — Full-text search

### Web Research (via Firecrawl)
- `firecrawl_search` — Web search with content extraction
- `firecrawl_scrape` — Single URL content extraction
- `firecrawl_crawl` — Multi-page crawling
- `firecrawl_extract` — Structured data extraction
- `firecrawl_agent` — Autonomous multi-step research

### Local Computation
- `calculate_financial_ratios` — PE, PB, ROE, ROA, margins, etc.
- `calculate_growth_rates` — CAGR, YoY, sequential growth
- `calculate_statistics` — Mean, median, stddev, percentiles
- `calculate_dcf` — Discounted cash flow valuation

## Skills

Skills are specialized analysis workflows triggered by query keywords:

| Skill | Triggers |
|-------|----------|
| **DCF Valuation** | "dcf", "fair value", "overvalued", "undervalued" |
| **Comparable Analysis** | "comparable", "comps", "compare", "vs" |
| **Earnings Analysis** | "earnings", "quarterly results", "eps" |
| **Risk Assessment** | "risk", "downside", "red flags" |
| **Sector Analysis** | "sector", "industry trends" |
| **SEC Filing Analysis** | "10-k", "10-q", "sec filing" |
| **Portfolio Review** | "portfolio", "holdings", "diversification" |

## CLI Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/skills` | List built-in skills |
| `/history` | Show recent queries |
| `Ctrl+D` | Toggle workspace debug panel |
| `Ctrl+C` | Exit |

## Development

```bash
# Type check
bun typecheck

# Run tests
bun test

# Lint
bun lint

# Format
bun format
```

## Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **LLM:** Vercel AI SDK (`ai` + provider packages)
- **Web Research:** Firecrawl
- **Financial Data:** Financial Datasets API
- **Schema Validation:** Zod
- **Database:** SQLite (better-sqlite3)
- **CLI UI:** pi-tui
- **Linting:** Biome
- **Observability:** OpenTelemetry

## License

MIT
