import {
  TUI,
  ProcessTerminal,
  Input,
  Text,
  Markdown,
  Spacer,
  type MarkdownTheme,
} from "@mariozechner/pi-tui";
import { ChatLog } from "./components/chat-log.js";
import { AgentTrace } from "./components/agent-trace.js";
import { ProgressBar } from "./components/progress-bar.js";
import { WorkspacePanel } from "./components/workspace-panel.js";
import { DataTable } from "./components/data-table.js";
import { theme, colorize, bold, dim } from "./theme.js";
import type { AgentEvent } from "../agents/types.js";
import type { SynthesizedAnswer } from "../types.js";

export interface AppCallbacks {
  onQuery: (query: string) => Promise<SynthesizedAnswer>;
  onExit: () => void;
}

/** Minimal markdown theme for answer display */
const markdownTheme: MarkdownTheme = {
  heading: (t) => `\x1b[1m${t}\x1b[0m`,
  link: (t) => `\x1b[4m${t}\x1b[0m`,
  linkUrl: (t) => `\x1b[38;5;245m${t}\x1b[0m`,
  code: (t) => `\x1b[48;5;236m${t}\x1b[0m`,
  codeBlock: (t) => t,
  codeBlockBorder: (t) => `\x1b[38;5;240m${t}\x1b[0m`,
  quote: (t) => `\x1b[3m${t}\x1b[0m`,
  quoteBorder: (t) => `\x1b[38;5;240m${t}\x1b[0m`,
  hr: (t) => `\x1b[38;5;240m${t}\x1b[0m`,
  listBullet: (t) => `\x1b[38;5;39m${t}\x1b[0m`,
  bold: (t) => `\x1b[1m${t}\x1b[0m`,
  italic: (t) => `\x1b[3m${t}\x1b[0m`,
  strikethrough: (t) => `\x1b[9m${t}\x1b[0m`,
  underline: (t) => `\x1b[4m${t}\x1b[0m`,
};

/**
 * Main TUI application for Baxter.
 * Manages the layout: header, chat log, agent trace, progress, and input.
 */
export class App {
  private tui: TUI;
  private chatLog: ChatLog;
  private agentTrace: AgentTrace;
  private progressBar: ProgressBar;
  private workspacePanel: WorkspacePanel;
  private answerDisplay: Markdown;
  private dataTable: DataTable;
  private statusLine: Text;
  private input: Input;
  private callbacks: AppCallbacks;
  private isProcessing = false;

  constructor(callbacks: AppCallbacks) {
    this.callbacks = callbacks;
    const terminal = new ProcessTerminal();
    this.tui = new TUI(terminal, true);

    // Create components
    this.chatLog = new ChatLog();
    this.agentTrace = new AgentTrace();
    this.progressBar = new ProgressBar();
    this.workspacePanel = new WorkspacePanel();
    this.answerDisplay = new Markdown("", 1, 0, markdownTheme);
    this.dataTable = new DataTable();
    this.statusLine = new Text(this.buildStatusLine());
    this.input = new Input();

    // Wire input submission
    this.input.onSubmit = (value: string) => {
      this.input.setValue("");
      this.submitQuery(value);
    };

    // Build layout
    const header = new Text(this.buildHeader());
    this.tui.addChild(header);
    this.tui.addChild(new Spacer(1));
    this.tui.addChild(this.chatLog);
    this.tui.addChild(this.progressBar);
    this.tui.addChild(this.agentTrace);
    this.tui.addChild(this.answerDisplay);
    this.tui.addChild(this.dataTable);
    this.tui.addChild(this.workspacePanel);
    this.tui.addChild(new Spacer(1));
    this.tui.addChild(this.statusLine);
    this.tui.addChild(this.input);

    this.tui.setFocus(this.input);

    // Handle special keys
    this.tui.addInputListener((data: string) => {
      // Ctrl+D to toggle workspace debug
      if (data === "\x04") {
        this.workspacePanel.toggle();
        this.tui.requestRender();
        return { consume: true };
      }
      // Ctrl+C to exit
      if (data === "\x03") {
        this.stop();
        this.callbacks.onExit();
        return { consume: true };
      }
      return undefined;
    });
  }

  private buildHeader(): string {
    return [
      "",
      colorize(bold("  Baxter"), theme.primary) + dim(" — Autonomous Financial Research Agent"),
      dim("  Type a financial question, or /help for commands. Ctrl+D for debug. Ctrl+C to exit."),
      "",
    ].join("\n");
  }

  private buildStatusLine(): string {
    if (this.isProcessing) {
      return dim("  Processing...");
    }
    return dim("  Ready");
  }

  /** Handle agent events for live trace updates */
  handleAgentEvent(event: AgentEvent): void {
    this.agentTrace.handleEvent(event);

    if (event.type === "pipeline:start") {
      this.progressBar.setStages(event.agents);
      this.progressBar.advance();
    } else if (event.type === "agent:start") {
      this.progressBar.advance();
    } else if (event.type === "pipeline:complete") {
      this.progressBar.complete();
    } else if (event.type === "pipeline:error") {
      this.progressBar.markError();
    }

    this.tui.requestRender();
  }

  /** Submit a query for processing */
  async submitQuery(query: string): Promise<void> {
    if (this.isProcessing || !query.trim()) return;

    this.isProcessing = true;
    this.statusLine.setText(this.buildStatusLine());
    this.chatLog.addMessage("user", query);
    this.tui.requestRender();

    try {
      const answer = await this.callbacks.onQuery(query);
      this.answerDisplay.setText(answer.content);
      this.chatLog.addMessage("assistant", answer.content);

      // Render tables if present
      if (answer.tables?.length) {
        const firstTable = answer.tables[0];
        this.dataTable.setData(
          firstTable.columns.map((col) => ({ header: col, key: col })),
          firstTable.rows.map((row) => {
            const obj: Record<string, string | number> = {};
            firstTable.columns.forEach((col, i) => { obj[col] = row[i] ?? ""; });
            return obj;
          }),
          firstTable.title,
        );
      }

      if (answer.warnings?.length) {
        for (const warning of answer.warnings) {
          this.chatLog.addMessage("system", `Warning: ${warning}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.chatLog.addMessage("system", `Error: ${msg}`);
    } finally {
      this.isProcessing = false;
      this.statusLine.setText(this.buildStatusLine());
      this.tui.requestRender();
    }
  }

  start(): void {
    this.tui.start();
  }

  stop(): void {
    this.agentTrace.destroy();
    this.tui.stop();
  }
}
