import type { Component } from "@mariozechner/pi-tui";
import { colorize, dim, theme } from "../theme.js";

interface ToolEventData {
  tool: string;
  status: "pending" | "running" | "success" | "error";
  durationMs?: number;
  resultPreview?: string;
}

/** Compact display of tool execution events */
export class ToolEventDisplay implements Component {
  private events: ToolEventData[] = [];
  private maxEvents = 10;

  addEvent(event: ToolEventData): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    // Invalidated
  }

  updateLast(update: Partial<ToolEventData>): void {
    if (this.events.length > 0) {
      Object.assign(this.events[this.events.length - 1], update);
      // Invalidated
    }
  }

  invalidate(): void {
    // Invalidated
  }

  render(width: number): string[] {
    if (this.events.length === 0) return [];

    const lines: string[] = [];
    for (const event of this.events) {
      const icon =
        event.status === "running"
          ? colorize(theme.symbols.thinking, theme.warning)
          : event.status === "success"
            ? colorize(theme.symbols.check, theme.success)
            : event.status === "error"
              ? colorize(theme.symbols.cross, theme.error)
              : dim(theme.symbols.bullet);

      const duration = event.durationMs ? dim(` ${event.durationMs}ms`) : "";
      const preview = event.resultPreview
        ? dim(` ${theme.symbols.arrow} ${event.resultPreview.slice(0, width - 40)}`)
        : "";

      lines.push(`  ${icon} ${event.tool}${duration}${preview}`);
    }

    return lines;
  }
}
