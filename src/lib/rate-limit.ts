/**
 * 경량 인메모리 레이트 리미터 (슬라이딩 윈도우)
 *
 * ⚠️ Serverless(Vercel) 환경에서는 인스턴스마다 카운트가 분리되므로
 *    전역적으로 완벽한 제한은 아닙니다. 1차 남용 방어로는 충분하지만,
 *    강한 보장이 필요하면 @upstash/ratelimit + Upstash Redis로 교체하세요.
 */

export interface RateLimitResult {
  success: boolean;
  remaining: number;
}

export interface RateLimitOptions {
  /** 윈도우 내 허용 요청 수 */
  limit: number;
  /** 윈도우 크기(ms) */
  windowMs: number;
}

// key → 윈도우 내 요청 타임스탬프(ms) 목록
const buckets = new Map<string, number[]>();

// 메모리 보호: 키가 이 수를 넘으면 만료된 항목을 일괄 정리
const MAX_KEYS = 10_000;

export function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = (buckets.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    return { success: false, remaining: 0 };
  }

  timestamps.push(now);
  buckets.set(key, timestamps);

  if (buckets.size > MAX_KEYS) {
    buckets.forEach((ts, k) => {
      const live = ts.filter((t) => t > windowStart);
      if (live.length === 0) buckets.delete(k);
      else buckets.set(k, live);
    });
  }

  return { success: true, remaining: limit - timestamps.length };
}

/** 테스트용: 내부 상태 초기화 */
export function __resetRateLimit(): void {
  buckets.clear();
}
