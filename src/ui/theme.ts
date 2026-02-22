/** ANSI color codes for consistent styling */
export const theme = {
  // Colors
  primary: "\x1b[38;5;39m", // Blue
  secondary: "\x1b[38;5;245m", // Gray
  success: "\x1b[38;5;40m", // Green
  warning: "\x1b[38;5;214m", // Orange
  error: "\x1b[38;5;196m", // Red
  accent: "\x1b[38;5;141m", // Purple
  muted: "\x1b[38;5;240m", // Dark gray
  highlight: "\x1b[38;5;226m", // Yellow

  // Styles
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  reset: "\x1b[0m",

  // Agent colors
  agents: {
    orchestrator: "\x1b[38;5;39m", // Blue
    planner: "\x1b[38;5;141m", // Purple
    researcher: "\x1b[38;5;40m", // Green
    analyst: "\x1b[38;5;214m", // Orange
    validator: "\x1b[38;5;226m", // Yellow
    synthesizer: "\x1b[38;5;45m", // Cyan
  } as Record<string, string>,

  // Symbols
  symbols: {
    bullet: "\u2022",
    arrow: "\u2192",
    check: "\u2713",
    cross: "\u2717",
    spinner: ["\u280b", "\u2819", "\u2839", "\u2838", "\u283c", "\u2834", "\u2826", "\u2827", "\u2807", "\u280f"],
    thinking: "\u2026",
    pipeline: "\u2502",
    pipelineEnd: "\u2514",
    pipelineBranch: "\u251c",
  },
} as const;

export function colorize(text: string, color: string): string {
  return `${color}${text}${theme.reset}`;
}

export function bold(text: string): string {
  return `${theme.bold}${text}${theme.reset}`;
}

export function dim(text: string): string {
  return `${theme.dim}${text}${theme.reset}`;
}

export function agentColor(agent: string): string {
  return theme.agents[agent] ?? theme.primary;
}
