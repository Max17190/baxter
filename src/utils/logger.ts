import pino from "pino";

export const logger = pino({
  level: Bun.env.LOG_LEVEL ?? "info",
  transport:
    Bun.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

export function createChildLogger(name: string) {
  return logger.child({ module: name });
}
