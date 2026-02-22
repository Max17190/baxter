# Baxter

Autonomous multi-agent financial research system built with TypeScript, Bun, and Vercel AI SDK.

## Quick Start

```bash
bun install
bun start          # Launch TUI
bun test           # Run tests (117 tests, all passing)
bun run eval       # Run evaluation suite
```

**Minimum requirement:** One LLM API key (e.g., `ANTHROPIC_API_KEY`). Financial data works out of the box via free SEC EDGAR.

## Architecture

6-agent pipeline with dynamic routing based on query complexity:

- **Simple** (lookup): Researcher -> Synthesizer
- **Medium** (analysis): Planner -> Researcher -> Analyst -> Synthesizer
- **Complex** (deep research): Planner -> Researcher -> Analyst (bull/bear) -> Validator -> Synthesizer

Key architectural decisions:
- **Orchestrator** classifies queries with the fast model, then coordinates the pipeline
- **Planner** creates a task graph with dependencies; **Researcher** executes tasks in parallel waves
- **Analyst** runs as bull/bear debate on complex queries (parallel with separate workspace writes)
- **Planner, Validator, Synthesizer** override `run()` to call `generateObject` directly (no wasteful `generateText`)
- Agents return facts/output; the **orchestrator** owns all workspace writes (prevents race conditions)
- **Fact extraction** uses LLM-based `generateObject`, not regex splitting

## Tool Consolidation

The LLM sees only 6 tools (not 23):

| Tool | What it does | API key needed? |
|------|-------------|-----------------|
| `financial_data` | Agentic router -> 14 sub-tools (11 finance + 3 EDGAR) | No (EDGAR free) / optional paid |
| `web_research` | Unified search + URL scrape | Optional (Firecrawl) |
| `calculate_financial_ratios` | PE, ROE, margins, etc. | No |
| `calculate_growth_rates` | CAGR, YoY, sequential | No |
| `calculate_statistics` | Mean, median, stddev | No |
| `calculate_dcf` | DCF valuation | No |

The `financial_data` tool uses a fast-model LLM call to route natural language requests to the correct sub-tool internally. When no `FINANCIAL_DATASETS_API_KEY` is set, it falls back to free SEC EDGAR data.

## Project Structure

```
src/
  index.ts                          # Entry point, tool registration, TUI wiring
  config.ts                         # Zod-validated config (model IDs as "provider:model")
  types.ts                          # Core types (Fact, SynthesizedAnswer, etc.)
  agents/
    base-agent.ts                   # Shared agent logic (generateText + tracing)
    orchestrator.ts                 # Query classification, pipeline routing, task graph, bull/bear
    planner.ts                      # generateObject -> ResearchPlan
    researcher.ts                   # Tool-calling agent (generateText with maxSteps)
    analyst.ts                      # Analysis with bull/bear perspectives
    validator.ts                    # generateObject -> ValidationIssues
    synthesizer.ts                  # generateObject -> SynthesizedAnswer with tables
    fact-extractor.ts               # LLM-based fact extraction
    context/
      workspace.ts                  # Structured shared state, per-agent context building
      message-bus.ts                # Event pub/sub
      memory.ts                     # SQLite cross-session persistence
      conversation.ts               # Multi-turn with follow-up resolution
  tools/
    types.ts                        # ToolDefinition with cacheable field
    registry.ts                     # Central registry + LRU cache wrapper
    financial-data.ts               # Agentic router (THE tool the LLM calls)
    web-research.ts                 # Unified search/scrape
    finance/                        # 11 sub-tools (income, balance, cash, prices, etc.)
    edgar/                          # 3 sub-tools (search, filings, XBRL facts)
    firecrawl/                      # 5 sub-tools (search, scrape, crawl, extract, agent)
    calculation/                    # 4 tools (ratios, growth, statistics, DCF)
  skills/
    builtin/                        # 7 SKILL.md files (dcf, earnings, comps, etc.)
    registry.ts                     # Trigger-based skill matching
    loader.ts                       # YAML frontmatter parser
  llm/
    router.ts                       # Primary/fast model routing
    provider-registry.ts            # 7 LLM providers
    token-tracker.ts                # Per-model cost tracking
  observability/
    cost-tracker.ts                 # Session-level cost accumulation
    tracer.ts                       # OpenTelemetry span helpers
  utils/
    logger.ts                       # Pino structured logging
    cache.ts                        # LRU cache factory
    circuit-breaker.ts              # Closed/open/half-open state machine
  ui/
    app.ts                          # pi-tui TUI with DataTable support
tests/                              # 117 tests across 12 files
evals/                              # 20 Q&A pairs, LLM-as-judge scoring
```

## Key Patterns

- Tools use `defineTool()` from `src/tools/types.ts`
- `ToolDefinition.cacheable` defaults to `true`; registry wraps execute with LRU cache (only caches successes)
- Circuit breakers wrap all external API calls (finance, firecrawl, EDGAR)
- `BaseAgentDeps` includes optional `skillRegistry` and `memory`
- Skills matched by trigger keywords; prompt injected into researcher/analyst context
- Task graph has DFS cycle detection; failed dependencies don't block dependents
- `CostTracker.reset()` accumulates session totals before clearing

## Environment Variables

**LLM Providers (at least one required):**
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- `XAI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL`

**Model Selection:**
- `PRIMARY_MODEL` (default: `anthropic:claude-sonnet-4-20250514`)
- `FAST_MODEL` (default: `anthropic:claude-haiku-4-5-20251001`)

**Data APIs (all optional):**
- `FINANCIAL_DATASETS_API_KEY` - Broader financial data (prices, insider trades, estimates)
- `FIRECRAWL_API_KEY` - Web research (news, earnings calls, qualitative data)

**Observability (optional):**
- `OTEL_EXPORTER_OTLP_ENDPOINT` - OpenTelemetry trace export
- `LOG_LEVEL` (default: `info`)

## Commands

TUI commands: `/help`, `/cost`, `/history`, `/skills`, `/debug`, `/clear`

## Testing

```bash
bun test                  # All 117 tests
bun run eval              # Full eval suite (20 queries, needs API keys)
bun run eval simple-pe    # Single eval by ID
bun run eval lookup       # Eval by category
```
