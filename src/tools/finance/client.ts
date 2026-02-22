import { loadConfig } from "../../config.js";

const BASE_URL = "https://api.financialdatasets.ai";

/** Rate limiter state */
interface RateLimitState {
  remaining: number;
  resetAt: number;
}

/** Financial Datasets API client with error handling and rate limiting */
export class FinancialDatasetsClient {
  private apiKey: string;
  private rateLimit: RateLimitState = { remaining: 100, resetAt: 0 };

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    // Check rate limit
    if (this.rateLimit.remaining <= 0 && Date.now() < this.rateLimit.resetAt) {
      const waitMs = this.rateLimit.resetAt - Date.now();
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const url = new URL(path, BASE_URL);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-API-Key": this.apiKey,
        Accept: "application/json",
      },
    });

    // Update rate limit state from headers
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    if (remaining !== null) {
      this.rateLimit.remaining = Number.parseInt(remaining, 10);
    }
    if (reset !== null) {
      this.rateLimit.resetAt = Number.parseInt(reset, 10) * 1000;
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const waitMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 60_000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.get<T>(path, params);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Financial Datasets API error: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
      );
    }

    return response.json() as Promise<T>;
  }
}

/** Singleton client instance */
let _client: FinancialDatasetsClient | null = null;

/** Get or create the singleton Financial Datasets API client */
export function getFinancialClient(): FinancialDatasetsClient {
  if (_client) return _client;

  const config = loadConfig();
  if (!config.financialDatasetsApiKey) {
    throw new Error(
      "FINANCIAL_DATASETS_API_KEY is required. Set it in your environment variables.",
    );
  }

  _client = new FinancialDatasetsClient(config.financialDatasetsApiKey);
  return _client;
}
