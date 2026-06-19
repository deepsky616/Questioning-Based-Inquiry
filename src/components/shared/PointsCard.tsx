"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AI_BONUS_TYPES, GAME_LABEL, BASE_POINTS, pointBonusLabel } from "@/lib/points-policy";
import { ACTIVITY_BASE_POINTS } from "@/lib/content-normalize";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";

const POLL_MS = 5000;

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

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

const bonusLabel = pointBonusLabel;

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
  const [showGuide, setShowGuide] = useState(false);

  // 폴링을 react-query로: 백그라운드 탭에선 자동 일시정지, 창 포커스 시 갱신
  const { data, isSuccess } = useQuery({
    queryKey: ["points-card"],
    queryFn: fetchPointsCard,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
  const totalPoints = data?.totalPoints ?? 0;
  const recent = data?.recent ?? [];
  const ranks = data?.ranks ?? { class: null, school: null, all: null };
  const loaded = isSuccess;

  const rankText = (v: number | null) => (v != null ? `${v}등` : "-");

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 내 포인트 + 순위 */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)" }}>
        <span className="absolute top-2 right-3 text-3xl opacity-20">⭐</span>
        <span className="absolute bottom-2 left-3 text-2xl opacity-20">✨</span>
        <p className="text-white/80 text-xs font-medium relative">내 포인트</p>
        <p className="text-5xl font-black mt-1 relative">{loaded ? totalPoints : "..."}</p>
        <div className="mt-3 relative flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/90">
          <span>🏫 우리반 <b className="font-black">{rankText(ranks.class)}</b></span>
          <span>🏫 교내 <b className="font-black">{rankText(ranks.school)}</b></span>
          <span>🌐 전체 <b className="font-black">{rankText(ranks.all)}</b></span>
        </div>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="mt-3 relative inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/30 transition-colors"
        >
          ❓ 포인트 획득 방법
        </button>
      </div>

      {/* 최근 받은 포인트 */}
      <div className="md:col-span-2 rounded-2xl p-5 bg-card border border-border shadow-sm">
        <h3 className="font-black text-foreground text-sm mb-3">📜 최근 받은 포인트</h3>
        {recent.length === 0 ? (
          <EmptyState icon="⭐" title="아직 받은 포인트가 없어요" description="질문·댓글을 작성하거나 질문놀이에 참여해 보세요!" />
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {recent.slice(0, 8).map((log) => {
              const b = bonusLabel(log.bonusType);
              const game = GAME_LABEL[log.gameId];
              const isPending = log.status === "PENDING";
              const isRejected = log.status === "REJECTED";
              // instance:<UUID>는 중복 지급 방지용 내부 키이므로 표시하지 않는다
              const showReason = log.reason && log.reason !== b.label && !log.reason.startsWith("instance:");
              return (
                <div key={log.id}
                  className={`flex items-center gap-2 text-sm py-1 ${isRejected ? "opacity-40" : ""}`}>
                  {/* 왼쪽: 획득 경로(이모지·라벨·게임·사유) — 남는 공간을 채우고 길면 줄임 */}
                  <span className="text-base shrink-0">{b.emoji}</span>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="text-foreground font-medium truncate">{b.label}</span>
                    {game && <span className="text-muted-foreground text-xs shrink-0">· {game}</span>}
                    {showReason && <span className="text-muted-foreground text-xs truncate">· {log.reason}</span>}
                  </div>
                  {/* 오른쪽: 상태 배지 + 시간 + 포인트를 한 묶음으로 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isPending && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        선생님 승인 대기
                      </span>
                    )}
                    {isRejected && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                        거부됨
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs">{relativeTime(log.createdAt)}</span>
                    <span className={`font-black w-11 text-right ${
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
            <DialogTitle>❓ 포인트는 이렇게 모아요</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border bg-card p-3">
              <p className="font-semibold text-foreground">✏️ 질문·댓글 쓰기</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>수업세션 질문 작성 <b className="text-indigo-600">+{ACTIVITY_BASE_POINTS.QUESTION_WRITE}점</b></li>
                <li>친구 질문에 답변(댓글) 작성 <b className="text-indigo-600">+{ACTIVITY_BASE_POINTS.COMMENT_WRITE}점</b></li>
              </ul>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="font-semibold text-foreground">🎮 질문놀이 게임</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>게임 참여 <b className="text-indigo-600">+{BASE_POINTS.PARTICIPATION}점</b></li>
                <li>좋은 질문 1개당 <b className="text-indigo-600">+{BASE_POINTS.PER_VALID_QUESTION}점</b></li>
                <li>끝까지 완료 <b className="text-indigo-600">+{BASE_POINTS.COMPLETION}점</b></li>
                <li>1등 우승 <b className="text-indigo-600">+{BASE_POINTS.WINNER_BONUS}점</b></li>
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">※ 혼자·AI 모드는 점수가 조금 더 낮아요.</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="font-semibold text-foreground">🏆 선생님이 주는 특별상</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {Object.values(AI_BONUS_TYPES).map((b) => (
                  <li key={b.key}>{b.emoji} {b.label} <b className="text-indigo-600">+{b.points}점</b></li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">※ 좋은 질문을 AI가 추천하면 선생님이 확인 후 줍니다.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
