type LogLevel = "INFO" | "WARN" | "ERROR";

function serializeContext(context: unknown): string {
  if (context === undefined || context === null) return "";
  if (typeof context === "string") return context;
  if (context instanceof Error) return context.message;
  try {
    return JSON.stringify(context);
  } catch {
    return String(context);
  }
}

export function formatLogMessage(
  level: LogLevel,
  message: string,
  context?: unknown
): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] ${level}: ${message}`;
  if (context === undefined) return base;
  const serialized = serializeContext(context);
  return serialized ? `${base} ${serialized}` : base;
}

function log(level: LogLevel, message: string, context?: unknown): void {
  const formatted = formatLogMessage(level, message, context);
  if (level === "INFO") console.info(formatted);
  else if (level === "WARN") console.warn(formatted);
  else console.error(formatted);
}

export const logger = {
  info: (message: string, context?: unknown) => log("INFO", message, context),
  warn: (message: string, context?: unknown) => log("WARN", message, context),
  error: (message: string, context?: unknown) => log("ERROR", message, context),
};
