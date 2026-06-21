"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useTranslations } from "next-intl";

const POLL_MS = 25000;

interface FlaggedCount { total: number; questions: number; comments: number }

async function fetchFlaggedCount(): Promise<FlaggedCount> {
  const res = await fetch("/api/teacher/flagged-count");
  if (!res.ok) throw new Error("flagged-count 실패");
  return res.json();
}
async function fetchPendingCount(): Promise<number> {
  const res = await fetch("/api/teacher/points/pending-count");
  if (!res.ok) return 0;
  const d = await res.json();
  return typeof d.count === "number" ? d.count : 0;
}

/**
 * 교사 알림 센터 — 두 가지 검토 항목을 한 벨로 모은다.
 *  - 🚩 부적절 의심 질문·댓글 (안전) → 질문조회의 부적절 의심 필터
 *  - 📝 AI 추천 포인트 검토 대기 (보상) → 질문조회의 AI 추천 포인트 탭
 * 성격이 달라 합산 숫자가 아니라 항목별로 구분해 보여준다. (부적절 증가 시 토스트 알림)
 */
export function NotificationBell() {
  const t = useTranslations("notify");
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const prevRef = useRef<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: flagged } = useQuery({
    queryKey: ["flagged-count"],
    queryFn: fetchFlaggedCount,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
  const { data: pending } = useQuery({
    queryKey: ["pending-review-count"],
    queryFn: fetchPendingCount,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  const flaggedCount = flagged?.total ?? 0;
  const pendingCount = pending ?? 0;
  const total = flaggedCount + pendingCount;

  // 부적절 의심이 늘면 토스트로 알림(첫 응답은 기준값만)
  useEffect(() => {
    if (flagged === undefined) return;
    if (prevRef.current !== null && flagged.total > prevRef.current) {
      const added = flagged.total - prevRef.current;
      setToast(t("newFlagged", { added }));
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 6000);
    }
    prevRef.current = flagged.total;
  }, [flagged, t]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={t("title")}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
          >
            <span className="text-lg">🔔</span>
            {total > 0 && (
              <span
                className={`absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px] text-white ${
                  flaggedCount > 0 ? "bg-red-500" : "bg-indigo-500"
                }`}
              >
                {total > 99 ? "99+" : total}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">{t("title")}</div>
          {total === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="py-1">
              {flaggedCount > 0 && (
                <Link
                  href="/teacher-questions?flagged=1"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted"
                >
                  <span className="text-lg">🚩</span>
                  <span className="flex-1 text-sm text-foreground">
                    {t.rich("flaggedItem", { b: (c) => <b className="font-semibold text-red-600">{c}</b> })}
                  </span>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {flaggedCount}
                  </span>
                </Link>
              )}
              {pendingCount > 0 && (
                <Link
                  href="/teacher-questions?tab=review"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted"
                >
                  <span className="text-lg">📝</span>
                  <span className="flex-1 text-sm text-foreground">
                    {t.rich("pendingItem", { b: (c) => <b className="font-semibold text-amber-600">{c}</b> })}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    {pendingCount}
                  </span>
                </Link>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {toast && (
        <Link
          href="/teacher-questions?flagged=1"
          onClick={() => setToast(null)}
          className="fixed bottom-5 right-5 z-50 block max-w-xs rounded-xl border border-red-200 bg-card px-4 py-3 text-left text-sm shadow-lg dark:border-red-500/40"
        >
          <p className="font-semibold text-red-600">{toast}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("tapToView")}</p>
        </Link>
      )}
    </>
  );
}
