import { z } from "zod";
import { defineTool } from "./types.js";
import { createChildLogger } from "../utils/logger.js";
import type { SearchBackend } from "./search/types.js";

const log = createChildLogger("web-research");

const parameters = z.object({
  query: z.string().describe(
    "Search query or URL. If it starts with http:// or https://, the page will be scraped. Otherwise, a web search is performed and top results returned with content.",
  ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Number of search results to return (default 5, max 10). Ignored for URL scraping."),
});

export interface WebResearchConfig {
  firecrawlApiKey?: string;
  exaApiKey?: string;
  perplexityApiKey?: string;
  tavilyApiKey?: string;
}

/**
 * Detect which search backend to use based on available API keys.
 * Priority: Firecrawl > Exa > Perplexity > Tavily
 */
async function resolveSearchBackend(config: WebResearchConfig): Promise<SearchBackend | null> {
  if (config.firecrawlApiKey) {
    return {
      name: "firecrawl",
      async search(query: string, limit: number) {
        const { getFirecrawlClient, firecrawlBreaker } = await import("./firecrawl/client.js");
        const response = await firecrawlBreaker.execute(async () => {
          const client = getFirecrawlClient();
          return client.search(query, { limit });
        });
        if (!response.success) throw new Error(response.error ?? "Firecrawl search failed");
        // biome-ignore lint/suspicious/noExplicitAny: Firecrawl SDK types
        return (response.data as any[]).map((r: any) => ({
          url: r.url ?? "",
          title: r.title ?? r.metadata?.title ?? "",
          content: r.markdown ?? r.content ?? "",
        }));
      },
    };
  }

  if (config.exaApiKey) {
    const { createExaBackend } = await import("./search/exa.js");
    return createExaBackend(config.exaApiKey);
  }

  if (config.perplexityApiKey) {
    const { createPerplexityBackend } = await import("./search/perplexity.js");
    return createPerplexityBackend(config.perplexityApiKey);
  }

  if (config.tavilyApiKey) {
    const { createTavilyBackend } = await import("./search/tavily.js");
    return createTavilyBackend(config.tavilyApiKey);
  }

  return null;
}

/**
 * Creates the unified web_research tool.
 * Internally routes between search backends based on available API keys.
 * Priority: Firecrawl > Exa > Perplexity > Tavily
 *
 * For URL scraping: uses Firecrawl if available, otherwise falls back to web_fetch.
 */
export function createWebResearchTool(config: WebResearchConfig) {
  let backendPromise: Promise<SearchBackend | null> | null = null;

  function getBackend(): Promise<SearchBackend | null> {
    if (!backendPromise) {
      backendPromise = resolveSearchBackend(config);
    }
    return backendPromise;
  }

  return defineTool({
    name: "web_research",
    description:
      "Search the web or scrape a specific URL. Pass a search query to find relevant pages with content, or pass a full URL (https://...) to extract its content as markdown. Use for news, earnings calls, analyst opinions, and qualitative research.",
    parameters,
    category: "web",
    execute: async (params) => {
      const start = performance.now();
      try {
        const isUrl = params.query.startsWith("http://") || params.query.startsWith("https://");

        if (isUrl) {
          return await handleScrape(params.query, config, start);
        }

        // Search mode
        const backend = await getBackend();
        if (!backend) {
          return {
            toolName: "web_research",
            success: false,
            error: "No search backend configured. Set FIRECRAWL_API_KEY, EXASEARCH_API_KEY, PERPLEXITY_API_KEY, or TAVILY_API_KEY.",
            durationMs: Math.round(performance.now() - start),
          };
        }

        log.debug({ query: params.query, limit: params.limit, backend: backend.name }, "Web search");
        const results = await backend.search(params.query, params.limit ?? 5);

        return {
          toolName: "web_research",
          success: true,
          data: results,
          durationMs: Math.round(performance.now() - start),
        };
      } catch (error) {
        return {
          toolName: "web_research",
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Math.round(performance.now() - start),
        };
      }
    },
  });
}

async function handleScrape(url: string, config: WebResearchConfig, start: number) {
  log.debug({ url }, "Scraping URL");

  // Prefer Firecrawl for scraping if available
  if (config.firecrawlApiKey) {
    const { getFirecrawlClient, firecrawlBreaker } = await import("./firecrawl/client.js");
    const response = await firecrawlBreaker.execute(async () => {
      const client = getFirecrawlClient();
      return client.scrapeUrl(url, { formats: ["markdown"] });
    });

    const durationMs = Math.round(performance.now() - start);
    if (!response.success) {
      return { toolName: "web_research", success: false, error: response.error ?? "Scrape failed", durationMs };
    }
    return { toolName: "web_research", success: true, data: response, durationMs };
  }

  // Fallback: use web_fetch logic directly
  const { extractReadableContent } = await import("./web-fetch-utils.js");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      "User-Agent": "Baxter/1.0 (Financial Research Agent)",
      "Accept": "text/html,application/json,text/plain,*/*",
    },
  });

  if (!response.ok) {
    return {
      toolName: "web_research",
      success: false,
      error: `HTTP ${response.status} ${response.statusText}`,
      durationMs: Math.round(performance.now() - start),
    };
  }

  const html = await response.text();
  const content = extractReadableContent(html, url);

  return {
    toolName: "web_research",
    success: true,
    data: { url, markdown: content.slice(0, 50_000) },
    durationMs: Math.round(performance.now() - start),
  };
}
