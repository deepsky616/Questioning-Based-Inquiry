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

// 처리된(catch된) 오류도 알림 대상이 되도록 ERROR 로그를 Sentry로 전달한다.
// 서버 전용 + 동적 import — 클라이언트 번들에 SDK가 끌려가지 않고,
// DSN이 없으면 아무 일도 하지 않는다. 실패해도 앱 동작에 영향이 없어야 한다.
function reportErrorToSentry(message: string, context?: unknown): void {
  if (typeof window !== "undefined") return;
  if (!process.env.SENTRY_DSN) return;
  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureMessage(message, {
        level: "error",
        extra: { context: serializeContext(context) },
      });
    })
    .catch(() => {});
}

function log(level: LogLevel, message: string, context?: unknown): void {
  const formatted = formatLogMessage(level, message, context);
  if (level === "INFO") console.info(formatted);
  else if (level === "WARN") console.warn(formatted);
  else console.error(formatted);
  if (level === "ERROR") reportErrorToSentry(message, context);
}

export const logger = {
  info: (message: string, context?: unknown) => log("INFO", message, context),
  warn: (message: string, context?: unknown) => log("WARN", message, context),
  error: (message: string, context?: unknown) => log("ERROR", message, context),
};
