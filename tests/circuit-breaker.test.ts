import { describe, test, expect } from "bun:test";
import { CircuitBreaker } from "../src/utils/circuit-breaker.js";

describe("CircuitBreaker", () => {
  test("starts in closed state", () => {
    const cb = new CircuitBreaker({ name: "test" });
    expect(cb.currentState).toBe("closed");
  });

  test("stays closed on success", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 3 });
    const result = await cb.execute(async () => "ok");
    expect(result).toBe("ok");
    expect(cb.currentState).toBe("closed");
  });

  test("opens after reaching failure threshold", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 3, resetTimeoutMs: 60_000 });

    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(async () => { throw new Error("fail"); });
      } catch {}
    }

    expect(cb.currentState).toBe("open");
  });

  test("fails fast when open", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 2, resetTimeoutMs: 60_000 });

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(async () => { throw new Error("fail"); });
      } catch {}
    }

    expect(cb.currentState).toBe("open");

    // Should fail fast
    try {
      await cb.execute(async () => "should not run");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect((error as Error).message).toContain("Circuit breaker");
      expect((error as Error).message).toContain("open");
    }
  });

  test("transitions to half-open after reset timeout", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 2, resetTimeoutMs: 50 });

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(async () => { throw new Error("fail"); });
      } catch {}
    }

    expect(cb.currentState).toBe("open");

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 60));

    // Should transition to half-open and succeed
    const result = await cb.execute(async () => "recovered");
    expect(result).toBe("recovered");
    expect(cb.currentState).toBe("closed");
  });

  test("re-opens if half-open test fails", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 2, resetTimeoutMs: 50 });

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(async () => { throw new Error("fail"); });
      } catch {}
    }

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 60));

    // Half-open test fails
    try {
      await cb.execute(async () => { throw new Error("still broken"); });
    } catch {}

    expect(cb.currentState).toBe("open");
  });

  test("resets failure count on success", async () => {
    const cb = new CircuitBreaker({ name: "test", failureThreshold: 3 });

    // 2 failures
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(async () => { throw new Error("fail"); });
      } catch {}
    }

    // Success resets count
    await cb.execute(async () => "ok");
    expect(cb.currentState).toBe("closed");

    // 2 more failures should NOT open (count was reset)
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(async () => { throw new Error("fail"); });
      } catch {}
    }

    expect(cb.currentState).toBe("closed"); // Still closed, only 2 failures
  });
});
