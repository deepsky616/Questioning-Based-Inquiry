// AI 호출 공통 에러·판별 (의존성 없음 — 클라이언트/테스트에서도 안전하게 import 가능)

/** AI 키가 없을 때(교사 미설정 등) 던지는 에러. 라우트에서 503 응답으로 매핑한다. */
export class AiKeyMissingError extends Error {
  constructor() {
    super("AI_KEY_MISSING");
    this.name = "AiKeyMissingError";
  }
}

/** Gemini가 일시적으로 혼잡(503/429)할 때 던지는 에러. 라우트에서 사용자 안내로 매핑한다. */
export class AiBusyError extends Error {
  constructor() {
    super("AI_BUSY");
    this.name = "AiBusyError";
  }
}

/** 비어 있거나 사용할 수 없는 응답을 정상 결과로 저장하지 않는다. */
export class AiInvalidResponseError extends Error {
  constructor() {
    super("AI_INVALID_RESPONSE");
    this.name = "AiInvalidResponseError";
  }
}

/** 끝까지 생성되지 않은 응답은 질문·판정 결과로 저장하지 않는다. */
export class AiOutputTruncatedError extends AiInvalidResponseError {
  constructor() {
    super();
    this.message = "AI_OUTPUT_TRUNCATED";
    this.name = "AiOutputTruncatedError";
  }
}

/** 안전 차단은 모델을 바꿔 재요청하지 않는다. */
export class AiSafetyBlockedError extends AiInvalidResponseError {
  constructor() {
    super();
    this.message = "AI_SAFETY_BLOCKED";
    this.name = "AiSafetyBlockedError";
  }
}

/** 모델 종료·모델별 기능 미지원은 같은 요청을 대체 모델에서 시도할 수 있다. */
export function isModelUnavailableError(err: unknown): boolean {
  const status = typeof err === "object" && err !== null && "status" in err
    ? Number((err as { status: unknown }).status) : undefined;
  const msg = err instanceof Error ? err.message : String(err);
  if (/API[_ ]?KEY|UNAUTHENTICATED|PERMISSION_DENIED|credentials/i.test(msg)) return false;
  if (status === 404 || /\b404\b|NOT_FOUND|model.*(?:not found|no longer available|retired)/i.test(msg)) return true;
  return (status === 400 || status === undefined) &&
    /not supported|unsupported|not available/i.test(msg) &&
    /model|thinking|response[_ ]?(?:mime|json|schema)/i.test(msg);
}

/** 무료 티어 일일 한도 초과(재시도 무의미 — 내일 리셋 또는 유료 키 필요). */
export class AiQuotaError extends Error {
  constructor() {
    super("AI_QUOTA_EXCEEDED");
    this.name = "AiQuotaError";
  }
}

/** USB 시연 계정에 설정한 서버측 하루 한도 초과. */
export class DemoAiQuotaError extends AiQuotaError {
  constructor() {
    super();
    this.message = "DEMO_AI_DAILY_LIMIT_EXCEEDED";
    this.name = "DemoAiQuotaError";
  }
}

/**
 * Gemini 무료 티어 '일일' 한도 초과 판별 — 분당 한도(잠시 후 재시도 가능)와 달리
 * 같은 모델 재시도가 무의미하므로 즉시 대체 모델로 넘어가거나 사용자에게 안내한다.
 * 예: quotaId "GenerateRequestsPerDayPerProjectPerModel-FreeTier"
 */
export function isDailyQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /PerDay|free_tier_requests/i.test(msg) && /429|Too Many Requests|quota/i.test(msg);
}

/** 일시 오류(모델 혼잡·레이트 리밋) 판별 — 재시도 대상 */
export function isTransientAiError(err: unknown): boolean {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status?: unknown }).status
      : undefined;
  if ([429, 500, 502, 503, 504].includes(Number(status))) return true;

  const msg = err instanceof Error ? err.message : String(err);
  return /\b(500|502|503|504|429)\b|Service Unavailable|high demand|overloaded|Resource has been exhausted|Too Many Requests|fetch failed|network error|timed?\s*out|ETIMEDOUT|ECONNRESET/i.test(msg) ||
    (err instanceof Error && ["AbortError", "TimeoutError"].includes(err.name));
}
