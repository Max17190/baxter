import { describe, test, expect } from "bun:test";
import { Workspace } from "../src/agents/context/workspace.js";
import type { Fact, ResearchPlan } from "../src/types.js";

function makeFact(overrides: Partial<Fact> & { id: string }): Fact {
  return {
    content: `Fact ${overrides.id}`,
    confidence: 0.8,
    tags: [],
    provenance: {
      agent: "researcher",
      tool: "test-tool",
      timestamp: Date.now(),
    },
    ...overrides,
  };
}

describe("Workspace", () => {
  describe("addFact / addFacts", () => {
    test("addFact appends a fact", () => {
      const ws = new Workspace("test query");
      const fact = makeFact({ id: "f1" });
      ws.addFact(fact);
      expect(ws.facts).toHaveLength(1);
      expect(ws.facts[0].id).toBe("f1");
    });

    test("addFacts appends multiple facts", () => {
      const ws = new Workspace("test query");
      ws.addFacts([makeFact({ id: "f1" }), makeFact({ id: "f2" }), makeFact({ id: "f3" })]);
      expect(ws.facts).toHaveLength(3);
    });
  });

  describe("deduplication by ID", () => {
    test("replaces existing fact with same ID", () => {
      const ws = new Workspace("test query");
      ws.addFact(makeFact({ id: "f1", content: "original" }));
      ws.addFact(makeFact({ id: "f1", content: "updated" }));
      expect(ws.facts).toHaveLength(1);
      expect(ws.facts[0].content).toBe("updated");
    });

    test("does not deduplicate facts with different IDs", () => {
      const ws = new Workspace("test query");
      ws.addFact(makeFact({ id: "f1", content: "first" }));
      ws.addFact(makeFact({ id: "f2", content: "second" }));
      expect(ws.facts).toHaveLength(2);
    });

    test("addFacts deduplicates within the batch", () => {
      const ws = new Workspace("test query");
      ws.addFacts([
        makeFact({ id: "f1", content: "first" }),
        makeFact({ id: "f1", content: "second" }),
      ]);
      expect(ws.facts).toHaveLength(1);
      expect(ws.facts[0].content).toBe("second");
    });
  });

  describe("getFactsByAgent", () => {
    test("filters facts by agent name", () => {
      const ws = new Workspace("test query");
      ws.addFacts([
        makeFact({ id: "f1", provenance: { agent: "researcher", timestamp: 1 } }),
        makeFact({ id: "f2", provenance: { agent: "analyst", timestamp: 2 } }),
        makeFact({ id: "f3", provenance: { agent: "researcher", timestamp: 3 } }),
      ]);
      const researcherFacts = ws.getFactsByAgent("researcher");
      expect(researcherFacts).toHaveLength(2);
      expect(researcherFacts.every((f) => f.provenance.agent === "researcher")).toBe(true);
    });

    test("returns empty array when no facts match", () => {
      const ws = new Workspace("test query");
      ws.addFact(makeFact({ id: "f1" }));
      expect(ws.getFactsByAgent("nonexistent")).toHaveLength(0);
    });
  });

  describe("getFactsByTag", () => {
    test("filters facts by tag", () => {
      const ws = new Workspace("test query");
      ws.addFacts([
        makeFact({ id: "f1", tags: ["revenue", "growth"] }),
        makeFact({ id: "f2", tags: ["debt"] }),
        makeFact({ id: "f3", tags: ["revenue"] }),
      ]);
      const revenueFacts = ws.getFactsByTag("revenue");
      expect(revenueFacts).toHaveLength(2);
      expect(revenueFacts.map((f) => f.id)).toEqual(["f1", "f3"]);
    });

    test("returns empty array when no facts have the tag", () => {
      const ws = new Workspace("test query");
      ws.addFact(makeFact({ id: "f1", tags: ["revenue"] }));
      expect(ws.getFactsByTag("nonexistent")).toHaveLength(0);
    });
  });

  describe("getHighConfidenceFacts", () => {
    test("filters facts by confidence threshold (default 0.7)", () => {
      const ws = new Workspace("test query");
      ws.addFacts([
        makeFact({ id: "f1", confidence: 0.9 }),
        makeFact({ id: "f2", confidence: 0.5 }),
        makeFact({ id: "f3", confidence: 0.7 }),
        makeFact({ id: "f4", confidence: 0.3 }),
      ]);
      const highConf = ws.getHighConfidenceFacts();
      expect(highConf).toHaveLength(2);
      expect(highConf.map((f) => f.id)).toEqual(["f1", "f3"]);
    });

    test("accepts custom threshold", () => {
      const ws = new Workspace("test query");
      ws.addFacts([
        makeFact({ id: "f1", confidence: 0.9 }),
        makeFact({ id: "f2", confidence: 0.5 }),
        makeFact({ id: "f3", confidence: 0.85 }),
      ]);
      const highConf = ws.getHighConfidenceFacts(0.85);
      expect(highConf).toHaveLength(2);
      expect(highConf.map((f) => f.id)).toEqual(["f1", "f3"]);
    });
  });

  describe("buildContextFor", () => {
    test("always includes query", () => {
      const ws = new Workspace("What is Apple's revenue?");
      const ctx = ws.buildContextFor("planner");
      expect(ctx).toContain("Query: What is Apple's revenue?");
    });

    test("includes complexity when set", () => {
      const ws = new Workspace("test query");
      ws.setComplexity("complex");
      const ctx = ws.buildContextFor("planner");
      expect(ctx).toContain("Complexity: complex");
    });

    test("planner context includes query and complexity only", () => {
      const ws = new Workspace("test query");
      ws.setComplexity("simple");
      ws.addFact(makeFact({ id: "f1" }));
      const ctx = ws.buildContextFor("planner");
      expect(ctx).toContain("Query: test query");
      expect(ctx).toContain("Complexity: simple");
      // Planner should not get facts
      expect(ctx).not.toContain("Research Facts");
    });

    test("researcher context includes plan", () => {
      const ws = new Workspace("test query");
      const plan: ResearchPlan = {
        objective: "Analyze Apple revenue trends",
        tasks: [],
        estimatedComplexity: "medium",
      };
      ws.setPlan(plan);
      const ctx = ws.buildContextFor("researcher");
      expect(ctx).toContain("Research Plan:");
      expect(ctx).toContain("Analyze Apple revenue trends");
    });

    test("analyst context includes research facts", () => {
      const ws = new Workspace("test query");
      ws.addFact(
        makeFact({
          id: "f1",
          content: "Revenue was $100B",
          confidence: 0.9,
          provenance: { agent: "researcher", tool: "sec_search", timestamp: 1 },
        }),
      );
      const ctx = ws.buildContextFor("analyst");
      expect(ctx).toContain("Research Facts (1):");
      expect(ctx).toContain("Revenue was $100B");
      expect(ctx).toContain("researcher/sec_search");
    });

    test("validator context includes facts and analysis", () => {
      const ws = new Workspace("test query");
      ws.addFact(makeFact({ id: "f1", content: "A key finding" }));
      ws.setAnalysis("The company shows strong growth");
      const ctx = ws.buildContextFor("validator");
      expect(ctx).toContain("Facts to validate (1):");
      expect(ctx).toContain("[id:f1]");
      expect(ctx).toContain("Analysis:");
      expect(ctx).toContain("The company shows strong growth");
    });

    test("synthesizer context includes plan, high-confidence facts, analysis, and validation issues", () => {
      const ws = new Workspace("test query");
      ws.setPlan({
        objective: "Full analysis",
        tasks: [],
        estimatedComplexity: "complex",
      });
      ws.addFacts([
        makeFact({
          id: "f1",
          content: "High confidence fact",
          confidence: 0.9,
          provenance: { agent: "researcher", tool: "search", timestamp: 1, sourceDescription: "SEC filing" },
        }),
        makeFact({
          id: "f2",
          content: "Low confidence fact",
          confidence: 0.3,
        }),
      ]);
      ws.setAnalysis("Detailed analysis here");
      ws.setValidationIssues([
        { factId: "f1", issue: "Needs cross-reference", severity: "warning" },
      ]);

      const ctx = ws.buildContextFor("synthesizer");
      expect(ctx).toContain("Research Plan: Full analysis");
      expect(ctx).toContain("Facts (2):");
      // Only high-confidence facts (>=0.7) should appear in the fact listing
      expect(ctx).toContain("High confidence fact");
      expect(ctx).toContain("SEC filing");
      // Low confidence fact should not appear in the listed facts
      expect(ctx).not.toContain("Low confidence fact");
      expect(ctx).toContain("Analysis:");
      expect(ctx).toContain("Detailed analysis here");
      expect(ctx).toContain("Validation Issues:");
      expect(ctx).toContain("[warning] Needs cross-reference");
    });
  });
});
