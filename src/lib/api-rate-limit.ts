import { NextResponse } from "next/server";
import { rateLimit } from "./rate-limit";

/**
 * 인증된 사용자별 레이트 리밋 가드 (Gemini 등 비용 큰 호출 보호용).
 * 제한을 초과하면 429 응답을 반환하고, 통과하면 null을 반환한다.
 *
 * 사용 예:
 *   const limited = checkRateLimit(`ai-answer:${userId}`, 20);
 *   if (limited) return limited;
 */
export function checkRateLimit(
  key: string,
  limitPerMinute = 20
): NextResponse | null {
  const { success } = rateLimit(key, { limit: limitPerMinute, windowMs: 60_000 });
  if (success) return null;
  return NextResponse.json(
    { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
    { status: 429 }
  );
}
