import type { AgentEvent, AgentEventListener } from "../types.js";

/** Simple event bus for inter-agent communication and UI updates */
export class MessageBus {
  private listeners: AgentEventListener[] = [];

  on(listener: AgentEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let listener errors break the pipeline
      }
    }
  }

  removeAll(): void {
    this.listeners = [];
  }
}
