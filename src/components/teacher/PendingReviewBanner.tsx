"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

async function fetchPendingCount(): Promise<number> {
  const res = await fetch("/api/teacher/points/pending-count");
  if (!res.ok) return 0;
  const d = await res.json();
  return typeof d.count === "number" ? d.count : 0;
}

/**
 * AI 추천 포인트 검토 대기 안내 배너 (교사 대시보드).
 * 분석만 돌리고 승인을 잊으면 학생이 점수를 못 받으므로, 대기 건수를 상기시킨다.
 * 대기 0건이면 렌더하지 않는다. (대시보드 진입 시 1회 조회, 폴링 없음)
 */
export function PendingReviewBanner() {
  const { data: count = 0 } = useQuery({
    queryKey: ["pending-review-count"],
    queryFn: fetchPendingCount,
    staleTime: 60_000,
  });

  if (count <= 0) return null;

  return (
    <Link
      href="/teacher-questions"
      className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
    >
      <span className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
        <span className="text-base">📝</span>
        AI 추천 포인트 검토 대기 <strong className="font-bold">{count}건</strong> · 승인하면 학생에게 점수가 지급돼요
      </span>
      <span className="shrink-0 font-semibold text-amber-700 dark:text-amber-300">검토하러 가기 →</span>
    </Link>
  );
}
