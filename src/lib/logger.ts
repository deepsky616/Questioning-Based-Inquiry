type LogLevel = "INFO" | "WARN" | "ERROR";

export function formatLogMessage(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] ${level}: ${message}`;
  return context ? `${base} ${JSON.stringify(context)}` : base;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const formatted = formatLogMessage(level, message, context);
  if (level === "INFO") console.info(formatted);
  else if (level === "WARN") console.warn(formatted);
  else console.error(formatted);
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log("INFO", message, context),
  warn: (message: string, context?: Record<string, unknown>) => log("WARN", message, context),
  error: (message: string, context?: Record<string, unknown>) => log("ERROR", message, context),
};
