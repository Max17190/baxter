import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent, type BaseAgentDeps } from "./base-agent.js";
import type { AgentOutput, ValidationIssue } from "./types.js";
import { parseModelId } from "../config.js";
import { startAgentSpan, endSpan, endSpanWithError } from "../observability/tracer.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("agent");

const validationSchema = z.object({
  issues: z.array(
    z.object({
      factId: z.string(),
      issue: z.string(),
      severity: z.enum(["warning", "error"]),
      suggestion: z.string().optional(),
    }),
  ),
  overallAssessment: z.string(),
  dataQualityScore: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `You are a financial data validator. Your job is to cross-check facts and analysis for accuracy and consistency.

Guidelines:
- Check for internal consistency (do the numbers add up?)
- Look for stale or outdated data
- Verify that conclusions are supported by the evidence
- Check for common financial analysis errors (e.g., comparing TTM vs annual metrics)
- Flag any data that seems anomalous or potentially incorrect
- Rate the overall data quality

For each issue found, provide:
- The fact ID it relates to
- A description of the issue
- Severity (warning or error)
- A suggestion for resolution if possible

Be thorough but pragmatic — flag real issues, not theoretical concerns.`;

export class ValidatorAgent extends BaseAgent {
  constructor(deps: BaseAgentDeps) {
    super(
      {
        role: "validator",
        modelTier: "fast",
        systemPrompt: SYSTEM_PROMPT,
        maxSteps: 1,
      },
      deps,
    );
  }

  /** Override run() to go straight to generateObject — avoids wasteful generateText call */
  async run(): Promise<AgentOutput> {
    const start = performance.now();
    const role = this.config.role;
    const span = startAgentSpan(role, this.deps.workspace.query);

    log.info({ role, model: this.modelName }, "Agent starting");
    this.deps.bus.emit({ type: "agent:start", agent: role, query: this.deps.workspace.query });

    try {
      const context = this.deps.workspace.buildContextFor("validator");

      const result = await generateObject({
        model: this.model,
        schema: validationSchema,
        system: SYSTEM_PROMPT,
        prompt: context,
      });

      if (result.usage) {
        const { provider, model } = parseModelId(this.modelName);
        this.deps.tokenTracker.record(provider, model, result.usage.promptTokens, result.usage.completionTokens);
      }

      const issues: ValidationIssue[] = result.object.issues;
      this.deps.workspace.setValidationIssues(issues);
      this.deps.workspace.setDataQualityScore(result.object.dataQualityScore);

      // Update fact validation status
      for (const fact of this.deps.workspace.facts) {
        const relatedIssues = issues.filter((i) => i.factId === fact.id);
        if (relatedIssues.length === 0) {
          fact.validated = true;
        } else {
          fact.validated = !relatedIssues.some((i) => i.severity === "error");
          fact.validationNotes = relatedIssues.map((i) => i.issue).join("; ");
        }
      }

      const durationMs = Math.round(performance.now() - start);
      log.info({ role, durationMs, issues: issues.length }, "Agent completed");
      endSpan(span, { "agent.duration_ms": durationMs });
      this.deps.bus.emit({ type: "agent:complete", agent: role, durationMs });

      return { role, facts: [], rawOutput: result.object.overallAssessment, durationMs };
    } catch (error) {
      const durationMs = Math.round(performance.now() - start);
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error({ role, durationMs, error: errorMsg }, "Agent failed");
      endSpanWithError(span, error instanceof Error ? error : new Error(errorMsg));
      this.deps.bus.emit({ type: "agent:error", agent: role, error: errorMsg });
      return { role, facts: [], rawOutput: "", durationMs };
    }
  }

  protected async processResult(): Promise<Partial<AgentOutput>> {
    return {};
  }
}
