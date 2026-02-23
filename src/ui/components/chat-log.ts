import { type Component, truncateToWidth } from "@mariozechner/pi-tui";
import { theme, colorize, bold, dim } from "../theme.js";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

/** Displays the conversation history */
export class ChatLog implements Component {
  private messages: ChatMessage[] = [];
  private cachedLines: string[] | null = null;

  addMessage(role: ChatMessage["role"], content: string): void {
    this.messages.push({ role, content, timestamp: Date.now() });
    this.cachedLines = null;
  }

  clear(): void {
    this.messages = [];
    this.cachedLines = null;
  }

  invalidate(): void {
    this.cachedLines = null;
  }

  render(width: number): string[] {
    if (this.cachedLines) return this.cachedLines;

    const lines: string[] = [];

    for (const msg of this.messages) {
      const prefix =
        msg.role === "user"
          ? colorize(bold("You: "), theme.primary)
          : msg.role === "assistant"
            ? colorize(bold("Baxter: "), theme.accent)
            : dim("[system] ");

      // Word-wrap the content
      const wrapped = wordWrap(msg.content, width - 4);
      for (let i = 0; i < wrapped.length; i++) {
        const line = i === 0 ? `${prefix}${wrapped[i]}` : `    ${wrapped[i]}`;
        lines.push(truncateToWidth(line, width));
      }
      lines.push(""); // Blank line between messages
    }

    this.cachedLines = lines;
    return lines;
  }
}

function wordWrap(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length <= maxWidth) {
      lines.push(paragraph);
      continue;
    }
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}
