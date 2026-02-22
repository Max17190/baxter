import type { Component } from "@mariozechner/pi-tui";
import { colorize, dim, theme } from "../theme.js";

/** Simple progress indicator for pipeline stages */
export class ProgressBar implements Component {
  private stages: string[] = [];
  private currentStage = -1;
  private completedStages = new Set<number>();
  private errorStages = new Set<number>();
  private cachedLines: string[] | null = null;

  setStages(stages: string[]): void {
    this.stages = stages;
    this.currentStage = -1;
    this.completedStages.clear();
    this.errorStages.clear();
    this.cachedLines = null;
  }

  advance(): void {
    if (this.currentStage >= 0) {
      this.completedStages.add(this.currentStage);
    }
    this.currentStage++;
    this.cachedLines = null;
  }

  markError(stage?: number): void {
    this.errorStages.add(stage ?? this.currentStage);
    this.cachedLines = null;
  }

  complete(): void {
    if (this.currentStage >= 0) {
      this.completedStages.add(this.currentStage);
    }
    this.currentStage = this.stages.length;
    this.cachedLines = null;
  }

  invalidate(): void {
    this.cachedLines = null;
  }

  render(_width: number): string[] {
    if (this.stages.length === 0) return [];

    const parts = this.stages.map((stage, i) => {
      if (this.errorStages.has(i)) {
        return colorize(`${theme.symbols.cross} ${stage}`, theme.error);
      }
      if (this.completedStages.has(i)) {
        return colorize(`${theme.symbols.check} ${stage}`, theme.success);
      }
      if (i === this.currentStage) {
        return colorize(`${theme.symbols.arrow} ${stage}`, theme.warning);
      }
      return dim(`${theme.symbols.bullet} ${stage}`);
    });

    this.cachedLines = [`  ${parts.join(dim("  \u2500  "))}`];
    return this.cachedLines;
  }
}
