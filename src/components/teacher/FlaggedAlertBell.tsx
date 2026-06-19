"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

const POLL_MS = 25000;

interface FlaggedCount { total: number; questions: number; comments: number }

async function fetchFlaggedCount(): Promise<FlaggedCount> {
  const res = await fetch("/api/teacher/flagged-count");
  if (!res.ok) throw new Error("flagged-count 실패");
  return res.json();
}

/**
 * 교사 알림 벨 — 담당 학생의 부적절 의심(flagged) 질문·댓글 수를 주기적으로 폴링한다.
 * 새 항목이 늘면 토스트로 알리고, 클릭하면 질문조회의 부적절 의심 필터로 이동한다.
 */
export function FlaggedAlertBell() {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const prevRef = useRef<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 폴링을 react-query로: 백그라운드 탭 자동 일시정지 + 캐시 공유
  const { data } = useQuery({
    queryKey: ["flagged-count"],
    queryFn: fetchFlaggedCount,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
  const count = data?.total ?? 0;

  // 첫 응답은 기준값만 잡고, 이후 증가했을 때만 알림 토스트를 띄운다.
  useEffect(() => {
    if (data === undefined) return;
    if (prevRef.current !== null && data.total > prevRef.current) {
      const added = data.total - prevRef.current;
      setToast(`⚠️ 부적절 의심 질문·댓글 ${added}건이 새로 감지됐어요`);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 6000);
    }
    prevRef.current = data.total;
  }, [data]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const goReview = () => {
    setToast(null);
    router.push("/teacher-questions?flagged=1");
  };

  return (
    <>
      <button
        type="button"
        onClick={goReview}
        title="부적절 의심 질문·댓글 확인"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
      >
        <span className="text-lg">🔔</span>
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {toast && (
        <button
          type="button"
          onClick={goReview}
          className="fixed bottom-5 right-5 z-50 max-w-xs rounded-xl border border-red-200 bg-white px-4 py-3 text-left text-sm shadow-lg dark:border-red-500/40 dark:bg-card"
        >
          <p className="font-semibold text-red-600">{toast}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">눌러서 확인하기 →</p>
        </button>
      )}
    </>
  );
}
