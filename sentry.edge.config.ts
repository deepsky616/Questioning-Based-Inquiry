import * as Sentry from "@sentry/nextjs";

// DSN이 없으면 초기화하지 않는다 — 로컬·포크 환경에서 무비용 no-op.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    // 학생 개인정보 보호: IP·쿠키 등 기본 PII를 보내지 않는다.
    sendDefaultPii: false,
  });
}
