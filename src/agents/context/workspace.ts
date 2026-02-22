import type { Fact, QueryComplexity, ResearchPlan, SynthesizedAnswer } from "../../types.js";
import type { ValidationIssue, WorkspaceState } from "../types.js";

/**
 * Structured shared workspace that replaces Dexter's flat JSONL scratchpad.
 * Each agent reads/writes specific sections. Provides typed access
 * and agent-aware context building.
 */
export class Workspace {
  private state: WorkspaceState;

  constructor(query: string) {
    this.state = {
      query,
      facts: [],
    };
  }

  // --- Query ---
  get query(): string {
    return this.state.query;
  }

  // --- Complexity ---
  setComplexity(complexity: QueryComplexity): void {
    this.state.complexity = complexity;
  }

  get complexity(): QueryComplexity | undefined {
    return this.state.complexity;
  }

  // --- Plan ---
  setPlan(plan: ResearchPlan): void {
    this.state.plan = plan;
  }

  get plan(): ResearchPlan | undefined {
    return this.state.plan;
  }

  // --- Facts ---
  addFact(fact: Fact): void {
    // Deduplicate by id
    const existingIdx = this.state.facts.findIndex((f) => f.id === fact.id);
    if (existingIdx >= 0) {
      this.state.facts[existingIdx] = fact;
    } else {
      this.state.facts.push(fact);
    }
  }

  addFacts(facts: Fact[]): void {
    for (const fact of facts) {
      this.addFact(fact);
    }
  }

  get facts(): readonly Fact[] {
    return this.state.facts;
  }

  getFactsByAgent(agent: string): Fact[] {
    return this.state.facts.filter((f) => f.provenance.agent === agent);
  }

  getFactsByTag(tag: string): Fact[] {
    return this.state.facts.filter((f) => f.tags.includes(tag));
  }

  getValidatedFacts(): Fact[] {
    return this.state.facts.filter((f) => f.validated === true);
  }

  getHighConfidenceFacts(threshold = 0.7): Fact[] {
    return this.state.facts.filter((f) => f.confidence >= threshold);
  }

  // --- Analysis ---
  setAnalysis(analysis: string): void {
    this.state.analysis = analysis;
  }

  get analysis(): string | undefined {
    return this.state.analysis;
  }

  // --- Validation ---
  setValidationIssues(issues: ValidationIssue[]): void {
    this.state.validationIssues = issues;
  }

  get validationIssues(): readonly ValidationIssue[] | undefined {
    return this.state.validationIssues;
  }

  // --- Answer ---
  setAnswer(answer: SynthesizedAnswer): void {
    this.state.answer = answer;
  }

  get answer(): SynthesizedAnswer | undefined {
    return this.state.answer;
  }

  // --- Context Building ---
  /** Build context string for a specific agent role */
  buildContextFor(agent: string): string {
    const parts: string[] = [`Query: ${this.state.query}`];

    if (this.state.complexity) {
      parts.push(`Complexity: ${this.state.complexity}`);
    }

    switch (agent) {
      case "planner":
        // Planner needs the query and complexity
        break;

      case "researcher":
        // Researcher needs the plan
        if (this.state.plan) {
          parts.push(`\nResearch Plan:\n${JSON.stringify(this.state.plan, null, 2)}`);
        }
        break;

      case "analyst":
        // Analyst needs facts from research
        if (this.state.facts.length > 0) {
          parts.push(`\nResearch Facts (${this.state.facts.length}):`);
          for (const fact of this.state.facts) {
            parts.push(`- [${fact.confidence.toFixed(2)}] ${fact.content} (via ${fact.provenance.agent}/${fact.provenance.tool ?? "reasoning"})`);
          }
        }
        break;

      case "validator":
        // Validator needs facts and analysis
        if (this.state.facts.length > 0) {
          parts.push(`\nFacts to validate (${this.state.facts.length}):`);
          for (const fact of this.state.facts) {
            parts.push(`- [id:${fact.id}] ${fact.content} (confidence: ${fact.confidence})`);
          }
        }
        if (this.state.analysis) {
          parts.push(`\nAnalysis:\n${this.state.analysis}`);
        }
        break;

      case "synthesizer":
        // Synthesizer needs everything
        if (this.state.plan) {
          parts.push(`\nResearch Plan: ${this.state.plan.objective}`);
        }
        if (this.state.facts.length > 0) {
          parts.push(`\nFacts (${this.state.facts.length}):`);
          for (const fact of this.getHighConfidenceFacts()) {
            parts.push(`- ${fact.content} (source: ${fact.provenance.sourceDescription ?? fact.provenance.tool ?? "reasoning"})`);
          }
        }
        if (this.state.analysis) {
          parts.push(`\nAnalysis:\n${this.state.analysis}`);
        }
        if (this.state.validationIssues?.length) {
          parts.push(`\nValidation Issues:`);
          for (const issue of this.state.validationIssues) {
            parts.push(`- [${issue.severity}] ${issue.issue}`);
          }
        }
        break;
    }

    return parts.join("\n");
  }

  /** Serialize workspace state */
  toJSON(): WorkspaceState {
    return structuredClone(this.state);
  }
}
