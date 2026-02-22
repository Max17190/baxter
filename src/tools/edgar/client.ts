import { createChildLogger } from "../../utils/logger.js";
import { CircuitBreaker } from "../../utils/circuit-breaker.js";

const log = createChildLogger("edgar-client");

const EDGAR_BASE = "https://efts.sec.gov/LATEST";
const DATA_BASE = "https://data.sec.gov";
const USER_AGENT = "Baxter/1.0 (financial-research-agent)";

export const edgarBreaker = new CircuitBreaker({ name: "edgar", failureThreshold: 5, resetTimeoutMs: 60_000 });

/**
 * SEC EDGAR API client.
 * Uses free SEC EDGAR APIs — no API key required, just a user-agent email.
 */
export class EdgarClient {
  private userAgent: string;

  constructor(email?: string) {
    this.userAgent = email ? `Baxter/1.0 (${email})` : USER_AGENT;
  }

  /** Search EDGAR full-text search API */
  async search(query: string, options?: { dateRange?: string; forms?: string[]; limit?: number }): Promise<unknown> {
    return edgarBreaker.execute(async () => {
      const params = new URLSearchParams({ q: query });
      if (options?.dateRange) params.set("dateRange", options.dateRange);
      if (options?.forms?.length) params.set("forms", options.forms.join(","));
      if (options?.limit) params.set("from", "0");

      const url = `${EDGAR_BASE}/search-index?${params.toString()}`;
      log.debug({ url }, "EDGAR search");

      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`EDGAR search error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    });
  }

  /** Look up company CIK by ticker using SEC's company tickers JSON */
  async lookupCIK(ticker: string): Promise<string | null> {
    return edgarBreaker.execute(async () => {
      const upperTicker = ticker.toUpperCase();
      log.debug({ ticker: upperTicker }, "EDGAR CIK lookup");

      // Use SEC's official company tickers endpoint
      const url = `${DATA_BASE}/company_tickers.json`;
      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`EDGAR company tickers error: ${response.status}`);
      }

      const data = (await response.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;

      // Search for matching ticker
      for (const entry of Object.values(data)) {
        if (entry.ticker === upperTicker) {
          return String(entry.cik_str);
        }
      }

      return null;
    });
  }

  /** Cached CIK map for fast repeated lookups */
  private cikCache = new Map<string, string>();

  /** Look up CIK with caching */
  async resolveCIK(ticker: string): Promise<string | null> {
    const upper = ticker.toUpperCase();
    if (this.cikCache.has(upper)) return this.cikCache.get(upper)!;
    const cik = await this.lookupCIK(upper);
    if (cik) this.cikCache.set(upper, cik);
    return cik;
  }

  /** Get company submissions (filings list) by CIK */
  async getSubmissions(cik: string): Promise<unknown> {
    return edgarBreaker.execute(async () => {
      const paddedCIK = cik.replace(/^0+/, "").padStart(10, "0");
      const url = `${DATA_BASE}/submissions/CIK${paddedCIK}.json`;
      log.debug({ cik: paddedCIK, url }, "EDGAR submissions");

      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`EDGAR submissions error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    });
  }

  /** Get XBRL company facts (financial data) by CIK */
  async getCompanyFacts(cik: string): Promise<unknown> {
    return edgarBreaker.execute(async () => {
      const paddedCIK = cik.replace(/^0+/, "").padStart(10, "0");
      const url = `${DATA_BASE}/api/xbrl/companyfacts/CIK${paddedCIK}.json`;
      log.debug({ cik: paddedCIK, url }, "EDGAR company facts");

      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`EDGAR company facts error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    });
  }

  /** Get specific XBRL concept for a company */
  async getCompanyConcept(cik: string, taxonomy: string, concept: string): Promise<unknown> {
    return edgarBreaker.execute(async () => {
      const paddedCIK = cik.replace(/^0+/, "").padStart(10, "0");
      const url = `${DATA_BASE}/api/xbrl/companyconcept/CIK${paddedCIK}/${taxonomy}/${concept}.json`;
      log.debug({ cik: paddedCIK, taxonomy, concept, url }, "EDGAR company concept");

      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`EDGAR company concept error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    });
  }
}

/** Singleton client */
let _client: EdgarClient | null = null;

export function getEdgarClient(): EdgarClient {
  if (_client) return _client;
  _client = new EdgarClient();
  return _client;
}
