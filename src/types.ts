import type { z } from "zod";

/** Unique identifier for tracking facts and data through the pipeline */
export type FactId = string;

/** Source provenance for any piece of data */
export interface Provenance {
  agent: string;
  tool?: string;
  timestamp: number;
  sourceUrl?: string;
  sourceDescription?: string;
}

/** A single fact with provenance and confidence tracking */
export interface Fact {
  id: FactId;
  content: string;
  provenance: Provenance;
  confidence: number; // 0-1
  tags: string[];
  validated?: boolean;
  validationNotes?: string;
}

/** Query complexity levels for pipeline routing */
export type QueryComplexity = "simple" | "medium" | "complex";

/** Agent roles in the pipeline */
export type AgentRole =
  | "orchestrator"
  | "planner"
  | "researcher"
  | "analyst"
  | "validator"
  | "synthesizer";

/** Model tier for routing */
export type ModelTier = "fast" | "primary";

/** Pipeline configuration based on query complexity */
export interface PipelineConfig {
  complexity: QueryComplexity;
  agents: AgentRole[];
}

/** Research task created by the planner */
export interface ResearchTask {
  id: string;
  description: string;
  tools: string[];
  dependencies: string[];
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: string;
}

/** Research plan from the planner agent */
export interface ResearchPlan {
  objective: string;
  tasks: ResearchTask[];
  estimatedComplexity: QueryComplexity;
}

/** A structured data table in the answer */
export interface AnswerTable {
  title: string;
  columns: string[];
  rows: string[][];
}

/** Final synthesized answer */
export interface SynthesizedAnswer {
  content: string;
  citations: Citation[];
  confidence: number;
  factsUsed: FactId[];
  warnings?: string[];
  tables?: AnswerTable[];
}

/** Citation in the final answer */
export interface Citation {
  id: string;
  number?: number;
  source: string;
  url?: string;
  accessedAt: number;
}

/** Financial data types */
export interface FinancialStatement {
  ticker: string;
  period: string;
  fiscalYear: number;
  data: Record<string, number | string | null>;
}

export interface PriceData {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AnalystEstimate {
  ticker: string;
  period: string;
  metric: string;
  estimate: number;
  actual?: number;
}

/** Tool execution result */
export interface ToolResult {
  toolName: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
  sourceUrl?: string;
  sourceDescription?: string;
}

/** Token usage tracking */
export interface TokenUsage {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

/** Cost breakdown per query */
export interface QueryCost {
  totalUsd: number;
  byAgent: Record<string, TokenUsage>;
  byModel: Record<string, TokenUsage>;
}

/** Generic schema type helper */
export type SchemaType<T extends z.ZodType> = z.infer<T>;
