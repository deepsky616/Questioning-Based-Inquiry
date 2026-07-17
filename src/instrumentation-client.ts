// 브라우저 오류 보고 — NEXT_PUBLIC_SENTRY_DSN이 빌드에 주입된 경우에만 켜진다.
// 동적 import를 사용해 DSN이 없으면 학생 태블릿 번들에 SDK가 실리지 않는다.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0,
        // 학생 개인정보 보호: IP·쿠키 등 기본 PII를 보내지 않는다.
        sendDefaultPii: false,
      });
    })
    .catch(() => {
      // 모니터링 로드 실패가 앱 동작을 막아서는 안 된다
    });
}
