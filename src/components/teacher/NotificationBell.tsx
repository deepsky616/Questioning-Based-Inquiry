"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NotificationBellMenu, type NotificationMenuItem } from "@/components/shared/NotificationBellMenu";
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
  const items: NotificationMenuItem[] = [
    ...(flaggedCount > 0
      ? [{
          id: "flagged",
          href: "/teacher-questions?flagged=1",
          label: t.rich("flaggedItem", { b: (c) => <b className="font-semibold text-red-600">{c}</b> }),
          icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
          count: flaggedCount,
          tone: "danger" as const,
        }]
      : []),
    ...(pendingCount > 0
      ? [{
          id: "pending",
          href: "/teacher-questions?tab=review",
          label: t.rich("pendingItem", { b: (c) => <b className="font-semibold text-amber-600">{c}</b> }),
          icon: <ClipboardCheck className="h-4 w-4 text-amber-500" />,
          count: pendingCount,
          tone: "warning" as const,
        }]
      : []),
  ];

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
      <NotificationBellMenu
        title={t("title")}
        emptyText={t("empty")}
        count={total}
        badgeTone={flaggedCount > 0 ? "danger" : "default"}
        items={items}
        open={open}
        onOpenChange={setOpen}
      />

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
