import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// API 라우트·서버 컴포넌트에서 잡히지 않은 요청 오류를 Sentry로 보고한다.
// DSN이 없으면 Sentry.init이 실행되지 않아 no-op이다.
export const onRequestError = Sentry.captureRequestError;
