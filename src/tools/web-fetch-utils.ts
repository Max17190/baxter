import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/**
 * Extract readable article content from HTML using Mozilla Readability.
 * Falls back to htmlToMarkdown if Readability fails.
 */
export function extractReadableContent(html: string, _url: string): string {
  try {
    const { document } = parseHTML(html);
    // linkedom's document is compatible enough for Readability
    // biome-ignore lint/suspicious/noExplicitAny: linkedom Document differs from DOM Document
    const reader = new Readability(document as any);
    const article = reader.parse();
    if (article?.textContent) {
      return article.textContent.trim();
    }
  } catch {
    // Fall through to markdown fallback
  }
  return htmlToMarkdown(html);
}

/**
 * Simple HTML-to-markdown conversion.
 * Strips tags and normalizes whitespace — used as a fallback.
 */
export function htmlToMarkdown(html: string): string {
  let text = html;

  // Remove script and style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Convert common elements
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, content) => {
    return `${"#".repeat(Number(level))} ${stripTags(content).trim()}\n\n`;
  });
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, content) => `${stripTags(content).trim()}\n\n`);
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, content) => `- ${stripTags(content).trim()}\n`);
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, content) => `[${stripTags(content).trim()}](${href})`);

  // Strip remaining tags
  text = stripTags(text);

  // Normalize whitespace
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return text;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
