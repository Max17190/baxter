import { createChildLogger } from "./logger.js";

const log = createChildLogger("circuit-breaker");

type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold?: number;
  /** Time in ms to wait before transitioning from open to half-open */
  resetTimeoutMs?: number;
  /** Name for logging */
  name?: string;
}

/**
 * Simple circuit breaker that wraps async functions.
 * closed → open (after N failures) → half-open (after timeout) → closed/open
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
    this.name = options.name ?? "default";
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "half-open";
        log.info({ name: this.name }, "Circuit half-open, testing");
      } else {
        throw new Error(
          `Circuit breaker "${this.name}" is open — failing fast. Retry after ${Math.ceil((this.resetTimeoutMs - (Date.now() - this.lastFailureTime)) / 1000)}s`,
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      log.info({ name: this.name }, "Circuit closed after successful test");
    }
    this.failureCount = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = "open";
      log.warn({ name: this.name, failures: this.failureCount }, "Circuit opened");
    }
  }

  get currentState(): CircuitState {
    return this.state;
  }
}
