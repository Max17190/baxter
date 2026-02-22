import type { Config } from "../../config.js";
import { toolRegistry } from "../registry.js";
import { firecrawlSearch } from "./search.js";
import { firecrawlScrape } from "./scrape.js";
import { firecrawlCrawl } from "./crawl.js";
import { firecrawlExtract } from "./extract.js";
import { firecrawlAgent } from "./agent.js";

const FIRECRAWL_TOOLS = [
  firecrawlSearch,
  firecrawlScrape,
  firecrawlCrawl,
  firecrawlExtract,
  firecrawlAgent,
];

export function registerFirecrawlTools(config: Config): void {
  if (!config.firecrawlApiKey) return;
  for (const tool of FIRECRAWL_TOOLS) {
    toolRegistry.register(tool);
  }
}
