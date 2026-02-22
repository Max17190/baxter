import type { Component } from "@mariozechner/pi-tui";
import { bold, dim, colorize, theme } from "../theme.js";
import type { Workspace } from "../../agents/context/workspace.js";

/** Debug panel showing live workspace state */
export class WorkspacePanel implements Component {
  private workspace: Workspace | null = null;
  private visible = false;
  private cachedLines: string[] | null = null;

  setWorkspace(workspace: Workspace): void {
    this.workspace = workspace;
    this.cachedLines = null;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.cachedLines = null;
  }

  invalidate(): void {
    this.cachedLines = null;
  }

  render(width: number): string[] {
    if (!this.visible || !this.workspace) return [];
    if (this.cachedLines) return this.cachedLines;

    const ws = this.workspace;
    const lines: string[] = [];
    const divider = dim("\u2500".repeat(Math.min(width - 4, 60)));

    lines.push(divider);
    lines.push(bold(" Workspace Debug"));
    lines.push(divider);

    // Query
    lines.push(`  ${dim("Query:")} ${ws.query}`);
    lines.push(`  ${dim("Complexity:")} ${ws.complexity ?? "pending"}`);

    // Plan
    if (ws.plan) {
      lines.push(`  ${dim("Plan:")} ${ws.plan.objective}`);
      lines.push(`  ${dim("Tasks:")} ${ws.plan.tasks.length}`);
    }

    // Facts
    lines.push(`  ${dim("Facts:")} ${ws.facts.length}`);
    const validated = ws.facts.filter((f) => f.validated).length;
    if (validated > 0) {
      lines.push(`  ${dim("Validated:")} ${colorize(String(validated), theme.success)}`);
    }

    // Analysis
    if (ws.analysis) {
      lines.push(`  ${dim("Analysis:")} ${ws.analysis.slice(0, 80)}...`);
    }

    // Validation issues
    if (ws.validationIssues?.length) {
      lines.push(
        `  ${dim("Issues:")} ${colorize(String(ws.validationIssues.length), theme.warning)}`,
      );
    }

    lines.push(divider);

    this.cachedLines = lines;
    return lines;
  }
}
