import { describe, test, expect } from "bun:test";
import { MessageBus } from "../src/agents/context/message-bus.js";
import type { AgentEvent } from "../src/agents/types.js";

describe("MessageBus", () => {
  describe("on/emit pattern", () => {
    test("listener receives emitted events", () => {
      const bus = new MessageBus();
      const received: AgentEvent[] = [];

      bus.on((event) => {
        received.push(event);
      });

      bus.emit({ type: "agent:start", agent: "planner", query: "test" });
      bus.emit({ type: "agent:complete", agent: "planner", durationMs: 100 });

      expect(received).toHaveLength(2);
      expect(received[0].type).toBe("agent:start");
      expect(received[1].type).toBe("agent:complete");
    });

    test("multiple listeners all receive the same event", () => {
      const bus = new MessageBus();
      const listener1Events: AgentEvent[] = [];
      const listener2Events: AgentEvent[] = [];

      bus.on((event) => listener1Events.push(event));
      bus.on((event) => listener2Events.push(event));

      bus.emit({ type: "agent:start", agent: "researcher", query: "hello" });

      expect(listener1Events).toHaveLength(1);
      expect(listener2Events).toHaveLength(1);
      expect(listener1Events[0]).toEqual(listener2Events[0]);
    });

    test("no error when emitting with no listeners", () => {
      const bus = new MessageBus();
      // Should not throw
      expect(() => {
        bus.emit({ type: "agent:start", agent: "planner", query: "test" });
      }).not.toThrow();
    });
  });

  describe("removing listener", () => {
    test("on() returns an unsubscribe function", () => {
      const bus = new MessageBus();
      const received: AgentEvent[] = [];

      const unsubscribe = bus.on((event) => received.push(event));

      bus.emit({ type: "agent:start", agent: "planner", query: "test" });
      expect(received).toHaveLength(1);

      unsubscribe();

      bus.emit({ type: "agent:complete", agent: "planner", durationMs: 50 });
      // Should not have received the second event
      expect(received).toHaveLength(1);
    });

    test("removing one listener does not affect others", () => {
      const bus = new MessageBus();
      const events1: AgentEvent[] = [];
      const events2: AgentEvent[] = [];

      const unsub1 = bus.on((event) => events1.push(event));
      bus.on((event) => events2.push(event));

      bus.emit({ type: "agent:start", agent: "planner", query: "test" });
      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);

      unsub1();

      bus.emit({ type: "agent:complete", agent: "planner", durationMs: 50 });
      expect(events1).toHaveLength(1); // no new events
      expect(events2).toHaveLength(2); // still receives
    });

    test("removeAll clears all listeners", () => {
      const bus = new MessageBus();
      const events: AgentEvent[] = [];

      bus.on((event) => events.push(event));
      bus.on((event) => events.push(event));

      bus.emit({ type: "agent:start", agent: "planner", query: "test" });
      expect(events).toHaveLength(2); // 2 listeners each got 1 event

      bus.removeAll();

      bus.emit({ type: "agent:complete", agent: "planner", durationMs: 50 });
      expect(events).toHaveLength(2); // no new events
    });
  });

  describe("listener errors don't break other listeners", () => {
    test("error in first listener does not prevent second listener from receiving event", () => {
      const bus = new MessageBus();
      const received: AgentEvent[] = [];

      // First listener throws
      bus.on(() => {
        throw new Error("Listener 1 exploded");
      });

      // Second listener should still work
      bus.on((event) => {
        received.push(event);
      });

      bus.emit({ type: "agent:start", agent: "planner", query: "test" });
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("agent:start");
    });

    test("error in middle listener does not break subsequent listeners", () => {
      const bus = new MessageBus();
      const order: number[] = [];

      bus.on(() => order.push(1));
      bus.on(() => {
        order.push(2);
        throw new Error("Boom");
      });
      bus.on(() => order.push(3));

      bus.emit({ type: "agent:start", agent: "planner", query: "test" });
      expect(order).toEqual([1, 2, 3]);
    });

    test("all listeners execute even when multiple throw", () => {
      const bus = new MessageBus();
      const called: string[] = [];

      bus.on(() => {
        called.push("a");
        throw new Error("Error A");
      });
      bus.on(() => {
        called.push("b");
        throw new Error("Error B");
      });
      bus.on(() => {
        called.push("c");
      });

      bus.emit({ type: "agent:start", agent: "planner", query: "test" });
      expect(called).toEqual(["a", "b", "c"]);
    });
  });
});
