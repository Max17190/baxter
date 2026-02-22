# Baxter Agent Architecture

## Overview

Baxter uses a genuine multi-agent pipeline where each agent has a specialized role, its own system prompt, and access to specific tools. The Orchestrator classifies queries and dynamically routes them through the appropriate pipeline.

## Pipeline Routing

```
simple  -> Researcher -> Synthesizer
medium  -> Planner -> Researcher -> Analyst -> Synthesizer
complex -> Planner -> Researcher -> Analyst -> Validator -> Synthesizer
```

## Agent Details

### Orchestrator
- **Model tier:** Fast
- **Purpose:** Classify query complexity (simple/medium/complex) and coordinate the pipeline
- **Uses:** `generateObject` with Zod schema for structured classification
- **Output:** QueryComplexity + suggested tools

### Planner
- **Model tier:** Primary
- **Purpose:** Decompose complex queries into a structured research plan with task dependencies
- **Uses:** `generateObject` to produce a ResearchPlan
- **Output:** List of research tasks with tool assignments and dependency graph

### Researcher
- **Model tier:** Fast
- **Purpose:** Execute tools to gather raw data and facts
- **Tools:** All registered tools (finance, firecrawl, calculation)
- **Uses:** `generateText` with `maxSteps: 10` for multi-turn tool use
- **Output:** Facts with provenance and confidence scores

### Analyst
- **Model tier:** Primary
- **Purpose:** Analyze gathered data, compute financial ratios, and produce insights
- **Tools:** All registered tools (emphasis on calculation tools)
- **Uses:** `generateText` with `maxSteps: 8`
- **Output:** Structured analysis with quantitative evidence

### Validator
- **Model tier:** Fast
- **Purpose:** Cross-check facts for consistency, flag stale data, verify conclusions
- **Uses:** `generateObject` to produce validation issues
- **Output:** List of ValidationIssues with severity ratings

### Synthesizer
- **Model tier:** Primary
- **Purpose:** Generate the final user-facing answer with citations
- **Uses:** `generateObject` to produce a SynthesizedAnswer
- **Output:** Markdown answer with citations, confidence score, and warnings

## Shared Workspace

All agents communicate through a typed Workspace (not a flat scratchpad):

```
WorkspaceState {
  query: string
  complexity?: QueryComplexity
  plan?: ResearchPlan
  facts: Fact[]
  analysis?: string
  validationIssues?: ValidationIssue[]
  answer?: SynthesizedAnswer
}
```

Each agent gets context tailored to its role via `workspace.buildContextFor(agentRole)`.

## Fact Provenance

Every piece of data is tracked as a Fact with:
- Unique ID
- Content
- Source agent and tool
- Confidence score (0-1)
- Tags for categorization
- Validation status

## Model Routing

The dual-model strategy cuts costs ~40%:
- **Fast model** (e.g., Haiku, GPT-4.1-mini): Classification, research, validation
- **Primary model** (e.g., Sonnet, GPT-4.1): Planning, analysis, synthesis
