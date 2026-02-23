import { z } from "zod";
import { defineTool } from "./types.js";
import { createCache } from "../utils/cache.js";
import { extractReadableContent, htmlToMarkdown } from "./web-fetch-utils.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("web-fetch");

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CHARS = 50_000;

const fetchCache = createCache<{ content: string }>({ maxSize: 100, ttlMs: 15 * 60_000 });

const parameters = z.object({
  url: z.string().url().describe("The URL to fetch content from."),
  extractMode: z
    .enum(["markdown", "text"])
    .optional()
    .default("markdown")
    .describe("Extraction mode: 'markdown' uses Readability for article extraction (default), 'text' returns plain text."),
  maxChars: z
    .number()
    .int()
    .min(1000)
    .max(200_000)
    .optional()
    .default(DEFAULT_MAX_CHARS)
    .describe("Maximum characters to return (default 50,000)."),
});

/**
 * Lightweight HTTP fetch tool — no API key required, always available.
 * Fetches a URL, extracts content using Readability, and returns text/markdown.
 */
export function createWebFetchTool() {
  return defineTool({
    name: "web_fetch",
    description:
      "Fetch and extract content from a URL. Returns clean text/markdown from web pages. No API key required. Use for reading specific URLs, documentation, articles, and pages.",
    parameters,
    category: "web",
    cacheable: true,
    execute: async (params) => {
      const start = performance.now();
      const cacheKey = `${params.url}:${params.extractMode}:${params.maxChars}`;

      const cached = fetchCache.get(cacheKey);
      if (cached) {
        return {
          toolName: "web_fetch",
          success: true,
          data: { url: params.url, content: cached.content, fromCache: true },
          durationMs: Math.round(performance.now() - start),
        };
      }

      try {
        const content = await fetchWithRedirects(params.url, params.extractMode ?? "markdown");
        const truncated = content.slice(0, params.maxChars ?? DEFAULT_MAX_CHARS);

        fetchCache.set(cacheKey, { content: truncated });

        return {
          toolName: "web_fetch",
          success: true,
          data: { url: params.url, content: truncated, truncated: truncated.length < content.length },
          durationMs: Math.round(performance.now() - start),
        };
      } catch (error) {
        return {
          toolName: "web_fetch",
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Math.round(performance.now() - start),
        };
      }
    },
  });
}

async function fetchWithRedirects(url: string, extractMode: string): Promise<string> {
  let currentUrl = url;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    log.debug({ url: currentUrl, attempt: i }, "Fetching URL");

    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Baxter/1.0 (Financial Research Agent)",
        "Accept": "text/html,application/json,text/plain,*/*",
      },
    });

    // Handle redirects manually
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect ${response.status} without Location header`);
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const json = await response.json();
      return JSON.stringify(json, null, 2);
    }

    if (contentType.includes("text/html")) {
      const html = await response.text();
      return extractMode === "text"
        ? htmlToMarkdown(html)
        : extractReadableContent(html, currentUrl);
    }

    // Plain text or other
    return await response.text();
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}
