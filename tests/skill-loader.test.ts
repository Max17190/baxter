import { describe, test, expect } from "bun:test";
import { parseSkillFile } from "../src/skills/loader.js";

describe("parseSkillFile", () => {
  test("parses valid SKILL.md content with all fields", () => {
    const content = `---
name: dcf-analysis
description: Run a DCF valuation on a company
triggers: [dcf, discounted cash flow, intrinsic value]
tools: [calculate_dcf, search_financials]
complexity: complex
---
# DCF Analysis

You are a financial analyst performing a DCF valuation.
Gather free cash flow projections and compute intrinsic value.`;

    const result = parseSkillFile(content);

    expect(result.name).toBe("dcf-analysis");
    expect(result.description).toBe("Run a DCF valuation on a company");
    expect(result.triggers).toEqual(["dcf", "discounted cash flow", "intrinsic value"]);
    expect(result.tools).toEqual(["calculate_dcf", "search_financials"]);
    expect(result.complexity).toBe("complex");
    expect(result.prompt).toContain("You are a financial analyst");
    expect(result.prompt).toContain("Gather free cash flow projections");
  });

  test("applies defaults for missing optional fields", () => {
    const content = `---
name: minimal-skill
---
Just a prompt.`;

    const result = parseSkillFile(content);

    expect(result.name).toBe("minimal-skill");
    expect(result.description).toBe("");
    expect(result.triggers).toEqual([]);
    expect(result.tools).toEqual([]);
    expect(result.complexity).toBe("medium");
    expect(result.prompt).toBe("Just a prompt.");
  });

  test("handles single-value triggers and tools (non-array)", () => {
    const content = `---
name: single-trigger
triggers: earnings
tools: search_financials
complexity: simple
---
Analyze earnings.`;

    const result = parseSkillFile(content);

    expect(result.triggers).toEqual(["earnings"]);
    expect(result.tools).toEqual(["search_financials"]);
    expect(result.complexity).toBe("simple");
  });

  test("trims whitespace from prompt", () => {
    const content = `---
name: trimming-test
---

  Some prompt content with leading whitespace.

`;

    const result = parseSkillFile(content);
    expect(result.prompt).toBe("Some prompt content with leading whitespace.");
  });

  test("handles quoted strings in arrays", () => {
    const content = `---
name: quoted-test
triggers: ["keyword one", 'keyword two', plain]
---
Prompt here.`;

    const result = parseSkillFile(content);
    expect(result.triggers).toEqual(["keyword one", "keyword two", "plain"]);
  });

  describe("throws on invalid format", () => {
    test("throws when frontmatter delimiters are missing", () => {
      const content = `name: no-frontmatter
Just some text without frontmatter.`;

      expect(() => parseSkillFile(content)).toThrow(
        "Invalid SKILL.md format: missing YAML frontmatter",
      );
    });

    test("throws when only opening delimiter is present", () => {
      const content = `---
name: broken
No closing delimiter`;

      expect(() => parseSkillFile(content)).toThrow(
        "Invalid SKILL.md format: missing YAML frontmatter",
      );
    });

    test("throws on empty content", () => {
      expect(() => parseSkillFile("")).toThrow(
        "Invalid SKILL.md format: missing YAML frontmatter",
      );
    });
  });
});

describe("trigger matching via SkillRegistry", () => {
  // This tests the trigger matching behavior from the SkillRegistry,
  // which consumes parsed SkillMeta objects.
  // We import SkillRegistry separately to test the full flow.

  test("matches skill by trigger keyword in query", async () => {
    const { SkillRegistry } = await import("../src/skills/registry.js");
    const registry = new SkillRegistry();

    registry.register({
      name: "dcf-analysis",
      description: "DCF valuation",
      triggers: ["dcf", "discounted cash flow", "intrinsic value"],
      tools: ["calculate_dcf"],
      complexity: "complex",
      prompt: "Perform DCF analysis",
    });

    registry.register({
      name: "earnings-analysis",
      description: "Earnings analysis",
      triggers: ["earnings", "quarterly results", "eps"],
      tools: ["search_financials"],
      complexity: "medium",
      prompt: "Analyze earnings",
    });

    const match = registry.match("What is the intrinsic value of Apple?");
    expect(match).not.toBeNull();
    expect(match!.name).toBe("dcf-analysis");
  });

  test("prefers longer trigger matches (more specific)", async () => {
    const { SkillRegistry } = await import("../src/skills/registry.js");
    const registry = new SkillRegistry();

    registry.register({
      name: "short-match",
      description: "Short",
      triggers: ["value"],
      tools: [],
      complexity: "simple",
      prompt: "Short",
    });

    registry.register({
      name: "long-match",
      description: "Long",
      triggers: ["intrinsic value"],
      tools: [],
      complexity: "medium",
      prompt: "Long",
    });

    const match = registry.match("What is the intrinsic value of Tesla?");
    expect(match).not.toBeNull();
    // "intrinsic value" (15 chars) > "value" (5 chars), but both match.
    // "intrinsic value" contributes 15 chars, while the short-match's "value" contributes 5.
    // However, "long-match" also matches "value" via substring? No, "value" is a trigger of
    // short-match only. The long-match has only "intrinsic value" which contributes 15.
    // short-match has "value" which contributes 5. So long-match wins.
    expect(match!.name).toBe("long-match");
  });

  test("returns null when no triggers match", async () => {
    const { SkillRegistry } = await import("../src/skills/registry.js");
    const registry = new SkillRegistry();

    registry.register({
      name: "dcf-analysis",
      description: "DCF",
      triggers: ["dcf", "discounted cash flow"],
      tools: [],
      complexity: "complex",
      prompt: "DCF",
    });

    const match = registry.match("What is the weather today?");
    expect(match).toBeNull();
  });
});
