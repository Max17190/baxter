import { describe, test, expect } from "bun:test";

// We test the fallback extraction path since LLM extraction requires a real model.
// The LLM path is tested in the eval suite.

describe("Fact extraction", () => {
  describe("fallback extraction (regex-based)", () => {
    // Import the module to test the fallback behavior
    test("module exports extractFactsWithLLM function", async () => {
      const mod = await import("../src/agents/fact-extractor.js");
      expect(typeof mod.extractFactsWithLLM).toBe("function");
    });

    test("returns empty array for short/empty text", async () => {
      const { extractFactsWithLLM } = await import("../src/agents/fact-extractor.js");
      // With a fake model that will fail, it should fall back and return empty for short text
      const fakeModel = {} as any;
      const result = await extractFactsWithLLM("short", fakeModel, "researcher");
      expect(result).toEqual([]);
    });

    test("returns empty array for empty text", async () => {
      const { extractFactsWithLLM } = await import("../src/agents/fact-extractor.js");
      const fakeModel = {} as any;
      const result = await extractFactsWithLLM("", fakeModel, "researcher");
      expect(result).toEqual([]);
    });

    test("falls back gracefully when model fails", async () => {
      const { extractFactsWithLLM } = await import("../src/agents/fact-extractor.js");
      // Fake model that throws
      const fakeModel = {
        doGenerate: async () => { throw new Error("model unavailable"); },
      } as any;

      const text = `
AAPL revenue was $394B in FY2023, up 8% year over year.
The company's gross margin expanded to 45.5% from 43.8%.
Services segment grew 17% to reach $85B annual run rate.
iPhone revenue declined 2% but remained the largest segment.
Operating cash flow was $112B, supporting continued buybacks.
      `.trim();

      const facts = await extractFactsWithLLM(text, fakeModel, "researcher", ["research"]);
      expect(facts.length).toBeGreaterThan(0);
      expect(facts.every((f) => f.content.length > 20)).toBe(true);
      expect(facts.every((f) => f.provenance.agent === "researcher")).toBe(true);
      expect(facts.every((f) => f.tags.includes("research"))).toBe(true);
      expect(facts.every((f) => typeof f.id === "string")).toBe(true);
    });
  });
});
