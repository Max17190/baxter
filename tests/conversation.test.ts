import { describe, test, expect } from "bun:test";
import { Conversation } from "../src/agents/context/conversation.js";

describe("Conversation", () => {
  test("starts empty", () => {
    const conv = new Conversation();
    expect(conv.turnCount).toBe(0);
    expect(conv.buildContext()).toBe("");
  });

  test("stores turns", () => {
    const conv = new Conversation();
    conv.addTurn("What is AAPL PE?", "AAPL PE is 28.5", []);
    expect(conv.turnCount).toBe(1);
  });

  test("limits to 10 turns", () => {
    const conv = new Conversation();
    for (let i = 0; i < 15; i++) {
      conv.addTurn(`Query ${i}`, `Answer ${i}`, []);
    }
    expect(conv.turnCount).toBe(10);
  });

  test("builds context from recent turns", () => {
    const conv = new Conversation();
    conv.addTurn("Analyze AAPL", "AAPL is a strong company...", []);
    conv.addTurn("What is their revenue?", "AAPL revenue is $394B", []);

    const context = conv.buildContext();
    expect(context).toContain("Analyze AAPL");
    expect(context).toContain("AAPL revenue is $394B");
    expect(context).toContain("[Previous Query]");
    expect(context).toContain("[Answer Summary]");
  });

  test("only includes last 3 turns in context", () => {
    const conv = new Conversation();
    for (let i = 0; i < 5; i++) {
      conv.addTurn(`Query ${i}`, `Answer ${i}`, []);
    }

    const context = conv.buildContext();
    expect(context).not.toContain("Query 0");
    expect(context).not.toContain("Query 1");
    expect(context).toContain("Query 2");
    expect(context).toContain("Query 3");
    expect(context).toContain("Query 4");
  });

  test("resolveFollowUp returns original query when no turns", async () => {
    const conv = new Conversation();
    const fakeModel = {} as any;
    const result = await conv.resolveFollowUp("What is AAPL PE?", fakeModel);
    expect(result).toBe("What is AAPL PE?");
  });

  test("resolveFollowUp returns original on model failure", async () => {
    const conv = new Conversation();
    conv.addTurn("Analyze AAPL", "Strong company", []);

    // Fake model that throws
    const fakeModel = {
      doGenerate: async () => { throw new Error("fail"); },
    } as any;

    const result = await conv.resolveFollowUp("What about margins?", fakeModel);
    expect(result).toBe("What about margins?");
  });
});
