import FirecrawlApp from "@mendable/firecrawl-js";
import { loadConfig } from "../../config.js";

/** Singleton Firecrawl client instance */
let _client: FirecrawlApp | null = null;

/**
 * Get or create the singleton Firecrawl client.
 * Reads FIRECRAWL_API_KEY from the environment via loadConfig().
 * Throws a descriptive error if the key is not set.
 */
export function getFirecrawlClient(): FirecrawlApp {
  if (_client) return _client;

  const config = loadConfig();
  if (!config.firecrawlApiKey) {
    throw new Error(
      "FIRECRAWL_API_KEY is required for web research tools. Set it in your environment variables.",
    );
  }

  _client = new FirecrawlApp({ apiKey: config.firecrawlApiKey });
  return _client;
}

/** Re-export the client type for convenience */
export type { FirecrawlApp };
