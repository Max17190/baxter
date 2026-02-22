import { generateObject } from "ai";
import { z } from "zod";
import type { LanguageModelV1 } from "ai";

const scoreSchema = z.object({
  score: z.number().min(0).max(5).describe("Quality score from 0 (terrible) to 5 (excellent)"),
  reasoning: z.string().describe("Brief explanation of the score"),
  factsCovered: z.array(z.string()).describe("Which expected facts were present in the answer"),
  factsMissing: z.array(z.string()).describe("Which expected facts were missing"),
});

export interface EvalResult {
  id: string;
  query: string;
  score: number;
  reasoning: string;
  factsCovered: string[];
  factsMissing: string[];
  latencyMs: number;
  costUsd: number;
  toolsUsed: string[];
  complexity: string;
}

/**
 * LLM-as-judge evaluator for answer quality.
 * Uses a judge model to score how well the answer addresses the query.
 */
export async function evaluateAnswer(
  judgeModel: LanguageModelV1,
  query: string,
  answer: string,
  expectedFacts: string[],
): Promise<{ score: number; reasoning: string; factsCovered: string[]; factsMissing: string[] }> {
  const result = await generateObject({
    model: judgeModel,
    schema: scoreSchema,
    system: `You are an expert financial research evaluator. Score the quality of the answer on a 0-5 scale:

5: Excellent — comprehensive, accurate, well-structured, specific data points
4: Good — mostly complete, accurate, minor gaps
3: Adequate — answers the question but lacks depth or specificity
2: Poor — partially answers the question, significant gaps
1: Very poor — mostly irrelevant or inaccurate
0: Terrible — completely fails to answer the question

Consider:
- Does the answer contain the expected facts?
- Are specific numbers, dates, and data points included?
- Is the answer well-structured and professional?
- Are sources cited or at least implied?`,
    prompt: `Query: ${query}

Expected facts to find: ${expectedFacts.join(", ")}

Answer:
${answer}`,
  });

  return result.object;
}
