"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { AI_BONUS_TYPES, BASE_POINTS, shouldShowPointReason } from "@/lib/points-policy";
import { usePointBonusLabel } from "@/components/shared/use-point-label";
import { ACTIVITY_BASE_POINTS } from "@/lib/content-normalize";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { visibleDataRefetchInterval } from "@/lib/query-refresh";

interface PointLog {
  id: string;
  gameId: string;
  roomCode: string | null;
  bonusType: string;
  points: number;
  reason: string;
  status?: string;
  createdAt: string;
}

interface LeaderboardMe { rank: number | null; totalPoints: number }
interface LeaderboardResp { scope: string; me?: LeaderboardMe }

function relativeTime(iso: string): { key: "justNow" | "minutesAgo" | "hoursAgo" | "daysAgo"; v: Record<string, number> } {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return { key: "justNow" as const, v: {} };
  if (m < 60) return { key: "minutesAgo" as const, v: { m } };
  const h = Math.floor(m / 60);
  if (h < 24) return { key: "hoursAgo" as const, v: { h } };
  const d = Math.floor(h / 24);
  return { key: "daysAgo" as const, v: { d } };
}

async function fetchPointsCard() {
  const [meRes, classLb, schoolLb, allLb]: [
    { totalPoints?: number; recent?: PointLog[] },
    LeaderboardResp, LeaderboardResp, LeaderboardResp,
  ] = await Promise.all([
    fetch("/api/points/me").then((r) => r.json()),
    fetch("/api/points/leaderboard?scope=class").then((r) => r.json()),
    fetch("/api/points/leaderboard?scope=school").then((r) => r.json()),
    fetch("/api/points/leaderboard?scope=all").then((r) => r.json()),
  ]);
  return {
    totalPoints: meRes.totalPoints ?? 0,
    recent: meRes.recent ?? [],
    ranks: {
      class: classLb?.me?.rank ?? null,
      school: schoolLb?.me?.rank ?? null,
      all: allLb?.me?.rank ?? null,
    },
  };
}

export default function PointsCard() {
  const t = useTranslations("points");
  const tAward = useTranslations("pointLabel");
  const { label: bonusLabel, gameLabel } = usePointBonusLabel();
  const [showGuide, setShowGuide] = useState(false);

  // 폴링을 react-query로: 백그라운드 탭에선 자동 일시정지, 창 포커스 시 갱신
  const { data, isSuccess } = useQuery({
    queryKey: ["points-card"],
    queryFn: fetchPointsCard,
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const totalPoints = data?.totalPoints ?? 0;
  const recent = data?.recent ?? [];
  const ranks = data?.ranks ?? { class: null, school: null, all: null };
  const loaded = isSuccess;

  const rankText = (v: number | null) => (v != null ? t("rank", { v }) : "-");

  return (
    <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-3">
      {/* 내 포인트 + 순위 */}
      <div className="relative overflow-hidden rounded-2xl p-6 text-white md:h-full"
        style={{ background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)" }}>
        <span className="absolute top-2 right-3 text-3xl opacity-20">⭐</span>
        <span className="absolute bottom-2 left-3 text-2xl opacity-20">✨</span>
        <p className="text-white/80 text-xs font-medium relative">{t("myPoints")}</p>
        <p className="text-5xl font-black mt-1 relative">{loaded ? totalPoints : "..."}</p>
        <div className="mt-3 relative flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/90">
          <span>{t("ourClass")} <b className="font-black">{rankText(ranks.class)}</b></span>
          <span>{t("school")} <b className="font-black">{rankText(ranks.school)}</b></span>
          <span>{t("all")} <b className="font-black">{rankText(ranks.all)}</b></span>
        </div>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="mt-3 relative inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/30 transition-colors"
        >
          {t("howToEarn")}
        </button>
      </div>

      {/* 최근 받은 포인트 */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm md:col-span-2 md:h-full">
        <h3 className="font-black text-foreground text-sm mb-3">{t("recentTitle")}</h3>
        {recent.length === 0 ? (
          <EmptyState icon="⭐" title={t("emptyTitle")} description={t("emptyDesc")} />
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {recent.slice(0, 8).map((log) => {
              const b = bonusLabel(log.bonusType);
              const game = gameLabel(log.gameId);
              const isPending = log.status === "PENDING";
              const isRejected = log.status === "REJECTED";
              const showReason = shouldShowPointReason(log.reason, b.label, log.bonusType);
              return (
                <div key={log.id}
                  className={`flex items-center gap-3 text-sm py-1 ${isRejected ? "opacity-40" : ""}`}>
                  {/* 왼쪽: 획득 경로(이모지·라벨·게임·사유) — 남는 공간을 채우고 길면 줄임 */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="text-base shrink-0">{b.emoji}</span>
                    <span className="text-foreground font-medium truncate">{b.label}</span>
                    {game && <span className="text-muted-foreground text-xs shrink-0">· {game}</span>}
                    {showReason && <span className="text-muted-foreground text-xs truncate">· {log.reason}</span>}
                  </div>
                  {/* 오른쪽: 상태 배지 + 시간 + 포인트를 값 열로 묶어 정렬 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isPending && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {t("pendingApproval")}
                      </span>
                    )}
                    {isRejected && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {t("rejected")}
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs w-12 text-right">{(() => { const r = relativeTime(log.createdAt); return t(r.key, r.v); })()}</span>
                    <span className={`font-black w-10 text-right ${
                      isPending ? "text-amber-500" : isRejected ? "text-muted-foreground" : "text-indigo-600"
                    }`}>
                      {isPending ? `(+${log.points})` : `+${log.points}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 포인트 획득 방법 안내 */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("guideTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border bg-card p-3">
              <p className="font-semibold text-foreground">{t("writeSection")}</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>{t("writeQuestion")} <b className="text-indigo-600">{t("pointsSuffix", { n: ACTIVITY_BASE_POINTS.QUESTION_WRITE })}</b></li>
                <li>{t("writeComment")} <b className="text-indigo-600">{t("pointsSuffix", { n: ACTIVITY_BASE_POINTS.COMMENT_WRITE })}</b></li>
              </ul>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="font-semibold text-foreground">{t("gameSection")}</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>{t("gamePlay")} <b className="text-indigo-600">{t("pointsSuffix", { n: BASE_POINTS.PARTICIPATION })}</b></li>
                <li>{t("perQuestion")} <b className="text-indigo-600">{t("pointsSuffix", { n: BASE_POINTS.PER_VALID_QUESTION })}</b></li>
                <li>{t("completion")} <b className="text-indigo-600">{t("pointsSuffix", { n: BASE_POINTS.COMPLETION })}</b></li>
                <li>{t("winner")} <b className="text-indigo-600">{t("pointsSuffix", { n: BASE_POINTS.WINNER_BONUS })}</b></li>
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">{t("soloNote")}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="font-semibold text-foreground">{t("specialSection")}</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {Object.values(AI_BONUS_TYPES).map((b) => (
                  <li key={b.key}>{b.emoji} {tAward(`award_${b.key}`)} <b className="text-indigo-600">{t("pointsSuffix", { n: b.points })}</b></li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">{t("aiNote")}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
