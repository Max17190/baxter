import type { Fact, QueryComplexity, ResearchPlan, SynthesizedAnswer } from "../../types.js";
import type { ReflectionSummary, ValidationIssue, WorkspaceState } from "../types.js";
import type { SkillMeta } from "../../skills/loader.js";

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

  // --- Matched Skill ---
  setMatchedSkill(skill: SkillMeta): void {
    this.state.matchedSkill = skill;
  }

  get matchedSkill(): SkillMeta | undefined {
    return this.state.matchedSkill;
  }

  // --- Prior Facts (from memory) ---
  setPriorFacts(facts: Fact[]): void {
    this.state.priorFacts = facts;
  }

  get priorFacts(): readonly Fact[] | undefined {
    return this.state.priorFacts;
  }

  // --- Conversation Context ---
  setConversationContext(context: string): void {
    this.state.conversationContext = context;
  }

  // --- Bull/Bear Analysis ---
  setBullAnalysis(analysis: string): void {
    this.state.bullAnalysis = analysis;
  }

  setBearAnalysis(analysis: string): void {
    this.state.bearAnalysis = analysis;
  }

  // --- Bull/Bear Round 1 (for iterative debate) ---
  setBullAnalysisRound1(analysis: string): void {
    this.state.bullAnalysisRound1 = analysis;
  }

  setBearAnalysisRound1(analysis: string): void {
    this.state.bearAnalysisRound1 = analysis;
  }

  // --- Data Quality Score ---
  setDataQualityScore(score: number): void {
    this.state.dataQualityScore = score;
  }

  get dataQualityScore(): number | undefined {
    return this.state.dataQualityScore;
  }

  // --- Reflexion ---
  addReflectionSummary(summary: ReflectionSummary): void {
    if (!this.state.reflectionSummaries) this.state.reflectionSummaries = [];
    this.state.reflectionSummaries.push(summary);
  }

  get reflectionSummaries(): readonly ReflectionSummary[] | undefined {
    return this.state.reflectionSummaries;
  }

  clearValidationIssues(): void {
    this.state.validationIssues = undefined;
    this.state.dataQualityScore = undefined;
  }

  // --- Context Building ---
  /** Build context string for a specific agent role */
  buildContextFor(agent: string): string {
    const parts: string[] = [];

    // Conversation context (from prior turns)
    if (this.state.conversationContext) {
      parts.push(`Conversation History:\n${this.state.conversationContext}\n`);
    }

    parts.push(`Query: ${this.state.query}`);

    if (this.state.complexity) {
      parts.push(`Complexity: ${this.state.complexity}`);
    }

    // Prior knowledge from memory
    if (this.state.priorFacts && this.state.priorFacts.length > 0) {
      parts.push(`\nPrior Knowledge (${this.state.priorFacts.length} facts from previous sessions):`);
      for (const fact of this.state.priorFacts) {
        parts.push(`- [${fact.confidence.toFixed(2)}] ${fact.content}`);
      }
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
        // Inject matched skill instructions
        if (this.state.matchedSkill) {
          parts.push(`\nSkill Instructions (${this.state.matchedSkill.name}):\n${this.state.matchedSkill.prompt}`);
        }
        // Inject reflection guidance from prior validation round
        if (this.state.reflectionSummaries?.length) {
          const latest = this.state.reflectionSummaries[this.state.reflectionSummaries.length - 1];
          parts.push(`\nReflection Notes (Round ${latest.round}):\n${latest.guidance}`);
          parts.push("Focus on addressing the validation issues identified above.");
        }
        break;

      case "analyst": {
        // Analyst gets tiered facts: confidence >= 0.6, sorted by confidence desc, capped at 30
        const analystFacts = this.state.facts
          .filter((f) => f.confidence >= 0.6)
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 30);
        if (analystFacts.length > 0) {
          parts.push(`\nResearch Facts (${analystFacts.length} of ${this.state.facts.length} total, filtered by confidence >= 0.6):`);
          for (const fact of analystFacts) {
            parts.push(`- [${fact.confidence.toFixed(2)}] ${fact.content} (via ${fact.provenance.agent}/${fact.provenance.tool ?? "reasoning"})`);
          }
        }
        parts.push("\nAnalyze the research facts above using calculation tools. The research phase already gathered all relevant data.");
        // Inject matched skill instructions
        if (this.state.matchedSkill) {
          parts.push(`\nSkill Instructions (${this.state.matchedSkill.name}):\n${this.state.matchedSkill.prompt}`);
        }
        // Inject reflection guidance from prior validation round
        if (this.state.reflectionSummaries?.length) {
          const latest = this.state.reflectionSummaries[this.state.reflectionSummaries.length - 1];
          parts.push(`\nReflection Notes (Round ${latest.round}):\n${latest.guidance}`);
          parts.push("Pay special attention to addressing these issues in your analysis.");
        }
        break;
      }

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
        // Note prior validation round for reflexion
        if (this.state.reflectionSummaries?.length) {
          const latest = this.state.reflectionSummaries[this.state.reflectionSummaries.length - 1];
          parts.push(`\nPrevious Validation Round: ${latest.round}`);
          parts.push(`Issues previously identified: ${latest.issuesAddressed.join(", ")}`);
          parts.push("Verify whether these issues have been resolved with the updated facts.");
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
        if (this.state.bullAnalysis && this.state.bearAnalysis) {
          parts.push(`\nBull Case Analysis:\n${this.state.bullAnalysis}`);
          parts.push(`\nBear Case Analysis:\n${this.state.bearAnalysis}`);
          if (this.state.bullAnalysisRound1 && this.state.bearAnalysisRound1) {
            parts.push("\nNote: A 2-round debate was conducted. Round 1 positions and Round 2 rebuttals are included in the full analysis above.");
          }
          parts.push("\nWeigh both the bull and bear perspectives to provide a balanced assessment.");
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
