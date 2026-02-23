import { type Component, truncateToWidth } from "@mariozechner/pi-tui";
import { theme, colorize, agentColor, dim } from "../theme.js";
import type { AgentEvent } from "../../agents/types.js";

interface TraceEntry {
  agent: string;
  status: "running" | "complete" | "error";
  message: string;
  durationMs?: number;
  children: TraceEntry[];
}

/** Hierarchical visualization of agent execution */
export class AgentTrace implements Component {
  private entries: TraceEntry[] = [];
  private activeAgents = new Map<string, TraceEntry>();
  private spinnerFrame = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;

  handleEvent(event: AgentEvent): void {
    // Invalidated

    switch (event.type) {
      case "pipeline:start": {
        this.entries = [];
        this.activeAgents.clear();
        this.startSpinner();
        break;
      }
      case "agent:start": {
        const entry: TraceEntry = {
          agent: event.agent,
          status: "running",
          message: "thinking...",
          children: [],
        };
        this.entries.push(entry);
        this.activeAgents.set(event.agent, entry);
        break;
      }
      case "agent:tool_call": {
        const parent = this.activeAgents.get(event.agent);
        if (parent) {
          parent.children.push({
            agent: event.agent,
            status: "running",
            message: `${event.tool}(${truncateParams(event.params)})`,
            children: [],
          });
        }
        break;
      }
      case "agent:tool_result": {
        const parent = this.activeAgents.get(event.agent);
        if (parent && parent.children.length > 0) {
          const last = parent.children[parent.children.length - 1];
          last.status = event.success ? "complete" : "error";
          last.durationMs = event.durationMs;
        }
        break;
      }
      case "agent:complete": {
        const entry = this.activeAgents.get(event.agent);
        if (entry) {
          entry.status = "complete";
          entry.durationMs = event.durationMs;
          entry.message = `done in ${formatDuration(event.durationMs)}`;
          this.activeAgents.delete(event.agent);
        }
        break;
      }
      case "agent:error": {
        const entry = this.activeAgents.get(event.agent);
        if (entry) {
          entry.status = "error";
          entry.message = event.error;
          this.activeAgents.delete(event.agent);
        }
        break;
      }
      case "pipeline:complete": {
        this.stopSpinner();
        break;
      }
      case "pipeline:error": {
        this.stopSpinner();
        break;
      }
    }
  }

  private startSpinner(): void {
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % theme.symbols.spinner.length;
      // Invalidated
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }

  invalidate(): void {
    // Invalidated
  }

  render(width: number): string[] {
    if (this.entries.length === 0) return [];

    const lines: string[] = [];
    const spinner = theme.symbols.spinner[this.spinnerFrame];

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const isLast = i === this.entries.length - 1;
      const prefix = isLast ? theme.symbols.pipelineEnd : theme.symbols.pipelineBranch;
      const color = agentColor(entry.agent);

      const statusIcon =
        entry.status === "running"
          ? colorize(spinner, theme.warning)
          : entry.status === "complete"
            ? colorize(theme.symbols.check, theme.success)
            : colorize(theme.symbols.cross, theme.error);

      lines.push(truncateToWidth(
        `  ${dim(prefix)} ${statusIcon} ${colorize(entry.agent, color)} ${dim(entry.message)}`,
        width,
      ));

      // Show tool calls as children
      for (let j = 0; j < entry.children.length; j++) {
        const child = entry.children[j];
        const childPrefix = isLast ? "  " : theme.symbols.pipeline;
        const childConnector =
          j === entry.children.length - 1
            ? theme.symbols.pipelineEnd
            : theme.symbols.pipelineBranch;

        const childIcon =
          child.status === "running"
            ? colorize(spinner, theme.warning)
            : child.status === "complete"
              ? colorize(theme.symbols.check, theme.success)
              : colorize(theme.symbols.cross, theme.error);

        const duration = child.durationMs ? dim(` (${formatDuration(child.durationMs)})`) : "";
        lines.push(truncateToWidth(
          `  ${dim(childPrefix)} ${dim(childConnector)} ${childIcon} ${dim(child.message)}${duration}`,
          width,
        ));
      }
    }

    return lines;
  }

  destroy(): void {
    this.stopSpinner();
  }
}

function truncateParams(params: unknown): string {
  const str = JSON.stringify(params);
  return str.length > 50 ? `${str.slice(0, 50)}...` : str;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
