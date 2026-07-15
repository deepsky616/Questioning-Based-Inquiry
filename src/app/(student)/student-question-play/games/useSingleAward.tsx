"use client";

import { useRef, useState, useCallback } from "react";
import { useLocale } from "next-intl";

export interface SingleAwardResult {
  awarded: number;
  cappedByLimit?: boolean;
  dailyRemaining?: number;
  dailyLimitReached?: boolean;
  message?: string;
  alreadyAwarded?: boolean;
}

/**
 * 혼자/AI 모드 게임 종료 시 1회 award 호출 헬퍼.
 * 동일 게임 인스턴스에서 두 번 호출되면 멱등 처리.
 */
export function useSingleAward() {
  const instanceIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `inst-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const awardedRef = useRef(false);
  const [result, setResult] = useState<SingleAwardResult | null>(null);

  const award = useCallback(
    async (opts: {
      mode: "solo" | "ai";
      gameId: string;
      validQuestions: number;
      completed: boolean;
    }): Promise<SingleAwardResult | null> => {
      if (awardedRef.current) return result;
      awardedRef.current = true;
      try {
        const res = await fetch("/api/points/award-single", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...opts,
            instanceId: instanceIdRef.current,
          }),
        });
        const data = (await res.json()) as SingleAwardResult;
        setResult(data);
        return data;
      } catch {
        return null;
      }
    },
    [result]
  );

  const reset = useCallback(() => {
    instanceIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `inst-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    awardedRef.current = false;
    setResult(null);
  }, []);

  return { award, result, reset };
}

/** 공통 결과 표시 컴포넌트 props용 */
export function AwardBadge({ result }: { result: SingleAwardResult | null }) {
  const locale = useLocale();
  if (!result) return null;
  if (result.awarded === 0 && result.dailyLimitReached) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 px-4 py-2 text-sm">
        ⏰ {result.message}
      </div>
    );
  }
  if (result.awarded > 0) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100 px-4 py-2 text-sm flex items-center gap-2">
        <span>🏆</span>
        <span className="font-bold">
          {locale === "en" ? `+${result.awarded} points earned!` : `+${result.awarded}점 적립!`}
        </span>
        {result.cappedByLimit && (
          <span className="text-xs text-amber-900 dark:text-amber-200">
            {locale === "en" ? "(daily limit reached)" : "(일일 상한 도달)"}
          </span>
        )}
        {typeof result.dailyRemaining === "number" && result.dailyRemaining > 0 && (
          <span className="text-xs text-emerald-800 dark:text-emerald-200 ml-auto">
            {locale === "en"
              ? `${result.dailyRemaining} points still available today`
              : `오늘 ${result.dailyRemaining}점 더 받을 수 있어요`}
          </span>
        )}
      </div>
    );
  }
  return null;
}
