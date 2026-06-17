"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 25000;

interface FlaggedCount { total: number; questions: number; comments: number }

/**
 * 교사 알림 벨 — 담당 학생의 부적절 의심(flagged) 질문·댓글 수를 주기적으로 폴링한다.
 * 새 항목이 늘면 토스트로 알리고, 클릭하면 질문조회의 부적절 의심 필터로 이동한다.
 */
export function FlaggedAlertBell() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const prevRef = useRef<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/teacher/flagged-count");
        if (!res.ok) return;
        const d: FlaggedCount = await res.json();
        if (cancelled) return;
        setCount(d.total);
        // 첫 폴링은 기준값만 잡고 토스트를 띄우지 않는다. 이후 증가 시에만 알림.
        if (prevRef.current !== null && d.total > prevRef.current) {
          const added = d.total - prevRef.current;
          setToast(`⚠️ 부적절 의심 질문·댓글 ${added}건이 새로 감지됐어요`);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(null), 6000);
        }
        prevRef.current = d.total;
      } catch {
        // 무시
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

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
