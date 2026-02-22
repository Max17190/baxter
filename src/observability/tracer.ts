import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";

const TRACER_NAME = "baxter";

/** Get the Baxter tracer instance */
function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

/** Start a span for an agent execution */
export function startAgentSpan(agentRole: string, query: string): Span {
  return getTracer().startSpan(`agent.${agentRole}`, {
    attributes: {
      "agent.role": agentRole,
      "query": query,
    },
  });
}

/** Start a span for a tool execution */
export function startToolSpan(toolName: string, params: Record<string, unknown>): Span {
  return getTracer().startSpan(`tool.${toolName}`, {
    attributes: {
      "tool.name": toolName,
      "tool.params": JSON.stringify(params),
    },
  });
}

/** Start a span for the full pipeline */
export function startPipelineSpan(query: string, complexity: string): Span {
  return getTracer().startSpan("pipeline", {
    attributes: {
      "pipeline.query": query,
      "pipeline.complexity": complexity,
    },
  });
}

/** End a span successfully */
export function endSpan(span: Span, attributes?: Record<string, string | number>): void {
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
  }
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/** End a span with an error */
export function endSpanWithError(span: Span, error: Error): void {
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.recordException(error);
  span.end();
}

/** Run a function within a traced span */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number>,
): Promise<T> {
  const span = getTracer().startSpan(name, { attributes });
  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error) span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
