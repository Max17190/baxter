import { generateObject } from "ai";
import { z } from "zod";
import { BaseAgent, type BaseAgentDeps } from "./base-agent.js";
import type { AgentOutput, ValidationIssue } from "./types.js";
import { parseModelId } from "../config.js";

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

  protected async processResult(): Promise<Partial<AgentOutput>> {
    const context = this.deps.workspace.buildContextFor("validator");

    const result = await generateObject({
      model: this.model,
      schema: validationSchema,
      system: SYSTEM_PROMPT,
      prompt: context,
    });

    if (result.usage) {
      const { provider, model } = parseModelId(this.modelName);
      this.deps.tokenTracker.record(
        provider,
        model,
        result.usage.promptTokens,
        result.usage.completionTokens,
      );
    }

    const issues: ValidationIssue[] = result.object.issues;
    this.deps.workspace.setValidationIssues(issues);

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

    return { facts: [] };
  }
}
