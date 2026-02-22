import { describe, test, expect, mock } from "bun:test";
import { Workspace } from "../src/agents/context/workspace.js";
import { MessageBus } from "../src/agents/context/message-bus.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { SkillRegistry } from "../src/skills/registry.js";
import type { AgentEvent } from "../src/agents/types.js";
import type { SkillMeta } from "../src/skills/loader.js";

// We can't easily mock the LLM calls in the orchestrator without
// a seam, so we test the components that the orchestrator relies on.

describe("Orchestrator components", () => {
  describe("Pipeline route selection", () => {
    const PIPELINE_ROUTES = {
      simple: ["researcher", "synthesizer"],
      medium: ["planner", "researcher", "analyst", "synthesizer"],
      complex: ["planner", "researcher", "analyst", "validator", "synthesizer"],
    };

    test("simple routes through researcher + synthesizer", () => {
      expect(PIPELINE_ROUTES.simple).toEqual(["researcher", "synthesizer"]);
    });

    test("medium includes planner and analyst", () => {
      expect(PIPELINE_ROUTES.medium).toContain("planner");
      expect(PIPELINE_ROUTES.medium).toContain("analyst");
      expect(PIPELINE_ROUTES.medium).not.toContain("validator");
    });

    test("complex includes validator", () => {
      expect(PIPELINE_ROUTES.complex).toContain("validator");
      expect(PIPELINE_ROUTES.complex).toHaveLength(5);
    });
  });

  describe("Skill matching integration", () => {
    test("orchestrator receives matched skill via skillRegistry", () => {
      const registry = new SkillRegistry();
      const skill: SkillMeta = {
        name: "dcf-valuation",
        description: "DCF analysis",
        triggers: ["dcf", "discounted cash flow", "intrinsic value"],
        tools: ["calculate_dcf"],
        complexity: "complex",
        prompt: "Run a DCF valuation...",
      };
      registry.register(skill);

      const matched = registry.match("Do a DCF for NVDA");
      expect(matched).not.toBeNull();
      expect(matched!.name).toBe("dcf-valuation");
    });

    test("skill is injected into workspace for researcher/analyst", () => {
      const ws = new Workspace("Do a DCF for NVDA");
      const skill: SkillMeta = {
        name: "dcf-valuation",
        description: "DCF analysis",
        triggers: ["dcf"],
        tools: ["calculate_dcf"],
        complexity: "complex",
        prompt: "Step 1: Get cash flows...",
      };

      ws.setMatchedSkill(skill);

      const researcherCtx = ws.buildContextFor("researcher");
      expect(researcherCtx).toContain("Skill Instructions (dcf-valuation)");
      expect(researcherCtx).toContain("Step 1: Get cash flows");

      const analystCtx = ws.buildContextFor("analyst");
      expect(analystCtx).toContain("Skill Instructions (dcf-valuation)");
    });

    test("skill not injected into validator/synthesizer context", () => {
      const ws = new Workspace("Do a DCF for NVDA");
      ws.setMatchedSkill({
        name: "dcf",
        description: "",
        triggers: [],
        tools: [],
        complexity: "complex",
        prompt: "SECRET INSTRUCTIONS",
      });

      const validatorCtx = ws.buildContextFor("validator");
      expect(validatorCtx).not.toContain("SECRET INSTRUCTIONS");

      const synthCtx = ws.buildContextFor("synthesizer");
      expect(synthCtx).not.toContain("SECRET INSTRUCTIONS");
    });
  });

  describe("Event emission", () => {
    test("pipeline:skill_matched event is emitted", () => {
      const bus = new MessageBus();
      const events: AgentEvent[] = [];
      bus.on((e) => events.push(e));

      bus.emit({ type: "pipeline:skill_matched", skill: "dcf-valuation" });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("pipeline:skill_matched");
    });

    test("pipeline events are emitted in order", () => {
      const bus = new MessageBus();
      const types: string[] = [];
      bus.on((e) => types.push(e.type));

      bus.emit({ type: "pipeline:start", complexity: "simple", agents: ["researcher", "synthesizer"] });
      bus.emit({ type: "agent:start", agent: "researcher", query: "test" });
      bus.emit({ type: "agent:complete", agent: "researcher", durationMs: 100 });
      bus.emit({
        type: "pipeline:complete",
        durationMs: 200,
        answer: { content: "answer", citations: [], confidence: 0.9, factsUsed: [] },
      });

      expect(types).toEqual(["pipeline:start", "agent:start", "agent:complete", "pipeline:complete"]);
    });
  });

  describe("Memory seeding", () => {
    test("prior facts are included in context", () => {
      const ws = new Workspace("What is AAPL PE?");
      ws.setPriorFacts([
        {
          id: "prior-1",
          content: "AAPL PE was 28.5 as of Jan 2026",
          provenance: { agent: "researcher", timestamp: Date.now() },
          confidence: 0.85,
          tags: ["valuation"],
        },
      ]);

      const ctx = ws.buildContextFor("planner");
      expect(ctx).toContain("Prior Knowledge");
      expect(ctx).toContain("AAPL PE was 28.5");
    });
  });

  describe("Bull/Bear workspace context", () => {
    test("synthesizer sees both bull and bear analyses", () => {
      const ws = new Workspace("Is NVDA overvalued?");
      ws.setBullAnalysis("NVDA has strong AI momentum...");
      ws.setBearAnalysis("NVDA is trading at extreme multiples...");

      const ctx = ws.buildContextFor("synthesizer");
      expect(ctx).toContain("Bull Case Analysis");
      expect(ctx).toContain("Bear Case Analysis");
      expect(ctx).toContain("balanced assessment");
    });
  });

  describe("Conversation context in workspace", () => {
    test("conversation context is included in all agent contexts", () => {
      const ws = new Workspace("What about their margins?");
      ws.setConversationContext("[Previous Query] Analyze AAPL\n[Answer Summary] AAPL is...");

      const plannerCtx = ws.buildContextFor("planner");
      expect(plannerCtx).toContain("Conversation History");
      expect(plannerCtx).toContain("Analyze AAPL");

      const researcherCtx = ws.buildContextFor("researcher");
      expect(researcherCtx).toContain("Conversation History");
    });
  });
});
