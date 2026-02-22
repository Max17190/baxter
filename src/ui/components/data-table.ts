import type { Component } from "@mariozechner/pi-tui";
import { bold, dim } from "../theme.js";

interface TableColumn {
  header: string;
  key: string;
  width?: number;
  align?: "left" | "right";
}

/** Renders financial data as formatted tables */
export class DataTable implements Component {
  private columns: TableColumn[] = [];
  private rows: Record<string, string | number>[] = [];
  private title?: string;
  private cachedLines: string[] | null = null;

  setData(
    columns: TableColumn[],
    rows: Record<string, string | number>[],
    title?: string,
  ): void {
    this.columns = columns;
    this.rows = rows;
    this.title = title;
    this.cachedLines = null;
  }

  invalidate(): void {
    this.cachedLines = null;
  }

  render(width: number): string[] {
    if (this.columns.length === 0 || this.rows.length === 0) return [];
    if (this.cachedLines) return this.cachedLines;

    // Calculate column widths
    const colWidths = this.columns.map((col) => {
      if (col.width) return col.width;
      const maxData = Math.max(
        col.header.length,
        ...this.rows.map((r) => String(r[col.key] ?? "").length),
      );
      return Math.min(maxData + 2, Math.floor(width / this.columns.length));
    });

    const lines: string[] = [];

    if (this.title) {
      lines.push(bold(this.title));
      lines.push("");
    }

    // Header
    const header = this.columns
      .map((col, i) => padCell(col.header, colWidths[i], col.align ?? "left"))
      .join(dim(" | "));
    lines.push(`  ${bold(header)}`);

    // Separator
    const sep = colWidths.map((w) => "\u2500".repeat(w)).join(dim("\u2500+\u2500"));
    lines.push(`  ${dim(sep)}`);

    // Data rows
    for (const row of this.rows) {
      const cells = this.columns
        .map((col, i) => {
          const val = String(row[col.key] ?? "");
          return padCell(val, colWidths[i], col.align ?? "left");
        })
        .join(dim(" | "));
      lines.push(`  ${cells}`);
    }

    lines.push("");
    this.cachedLines = lines;
    return lines;
  }
}

function padCell(text: string, width: number, align: "left" | "right"): string {
  const truncated = text.length > width ? text.slice(0, width - 1) + "\u2026" : text;
  return align === "right" ? truncated.padStart(width) : truncated.padEnd(width);
}
