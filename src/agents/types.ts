import type { AgentRole, ModelTier, QueryComplexity, Fact, ResearchPlan, SynthesizedAnswer } from "../types.js";
import type { SkillMeta } from "../skills/loader.js";

/** Events emitted by agents for UI and observability */
export type AgentEvent =
  | { type: "agent:start"; agent: AgentRole; query: string }
  | { type: "agent:thinking"; agent: AgentRole; content: string }
  | { type: "agent:tool_call"; agent: AgentRole; tool: string; params: unknown }
  | { type: "agent:tool_result"; agent: AgentRole; tool: string; success: boolean; durationMs: number }
  | { type: "agent:fact"; agent: AgentRole; fact: Fact }
  | { type: "agent:complete"; agent: AgentRole; durationMs: number }
  | { type: "agent:error"; agent: AgentRole; error: string }
  | { type: "pipeline:start"; complexity: QueryComplexity; agents: AgentRole[] }
  | { type: "pipeline:complete"; durationMs: number; answer: SynthesizedAnswer }
  | { type: "pipeline:error"; error: string }
  | { type: "pipeline:skill_matched"; skill: string }
  | { type: "pipeline:debate_round"; round: number }
  | { type: "pipeline:reflection_start"; round: number; tasksToRerun: string[] }
  | { type: "pipeline:reflection_complete"; round: number; durationMs: number }
  | { type: "pipeline:status"; message: string }
  | { type: "synthesizer:chunk"; content: string; done: boolean };

/** Agent configuration */
export interface AgentConfig {
  role: AgentRole;
  modelTier: ModelTier;
  systemPrompt: string;
  tools?: string[];
  maxSteps?: number;
}

/** What an agent produces */
export interface AgentOutput {
  role: AgentRole;
  facts: Fact[];
  rawOutput: string;
  plan?: ResearchPlan;
  answer?: SynthesizedAnswer;
  durationMs: number;
}

/** Workspace sections for typed shared state */
export interface WorkspaceState {
  query: string;
  complexity?: QueryComplexity;
  plan?: ResearchPlan;
  facts: Fact[];
  analysis?: string;
  bullAnalysis?: string;
  bearAnalysis?: string;
  bullAnalysisRound1?: string;
  bearAnalysisRound1?: string;
  validationIssues?: ValidationIssue[];
  dataQualityScore?: number;
  reflectionSummaries?: ReflectionSummary[];
  answer?: SynthesizedAnswer;
  matchedSkill?: SkillMeta;
  priorFacts?: Fact[];
  conversationContext?: string;
}

export interface ReflectionSummary {
  round: number;
  issuesAddressed: string[];
  guidance: string;
  tasksToRerun: string[];
}

export interface ValidationIssue {
  factId: string;
  issue: string;
  severity: "warning" | "error";
  suggestion?: string;
}

/** Event listener type */
export type AgentEventListener = (event: AgentEvent) => void;
