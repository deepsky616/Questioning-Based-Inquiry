"use client";

import { useEffect, useState } from "react";
import { AI_BONUS_TYPES, BonusKey, GAME_LABEL } from "@/lib/points-policy";

const POLL_MS = 5000;

interface PointLog {
  id: string;
  gameId: string;
  roomCode: string | null;
  bonusType: string;
  points: number;
  reason: string;
  createdAt: string;
}

interface LeaderboardEntry { id: string; name: string; grade: string | null; className: string | null; totalPoints: number }
interface LeaderboardResp { scope: string; students: LeaderboardEntry[]; school: string | null; grade: string | null; className: string | null }

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

function bonusLabel(bonusType: string): { label: string; emoji: string } {
  if (bonusType in AI_BONUS_TYPES) {
    const def = AI_BONUS_TYPES[bonusType as BonusKey];
    return { label: def.label, emoji: def.emoji };
  }
  if (bonusType === "PARTICIPATION") return { label: "참여", emoji: "✋" };
  if (bonusType === "VALID_QUESTIONS") return { label: "유효 질문", emoji: "❓" };
  if (bonusType === "COMPLETION") return { label: "완료", emoji: "✅" };
  if (bonusType === "WINNER") return { label: "우승", emoji: "👑" };
  return { label: bonusType, emoji: "🎯" };
}

export default function PointsCard({ myId }: { myId: string }) {
  const [totalPoints, setTotalPoints] = useState(0);
  const [recent, setRecent] = useState<PointLog[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResp | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const [meRes, lbRes] = await Promise.all([
          fetch("/api/points/me").then((r) => r.json()),
          fetch("/api/points/leaderboard?scope=class").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setTotalPoints(meRes.totalPoints ?? 0);
        setRecent(meRes.recent ?? []);
        setLeaderboard(lbRes);
      } catch {}
      finally { if (!cancelled) setLoaded(true); }
    };
    fetchAll();
    const iv = setInterval(fetchAll, POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const myRank = leaderboard
    ? leaderboard.students.findIndex((s) => s.id === myId) + 1
    : 0;
  const topStudents = leaderboard?.students.slice(0, 5) ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 내 포인트 */}
      <div className="rounded-2xl p-6 text-white relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)" }}>
        <span className="absolute top-2 right-3 text-3xl opacity-20">⭐</span>
        <span className="absolute bottom-2 left-3 text-2xl opacity-20">✨</span>
        <p className="text-white/80 text-xs font-medium relative">내 포인트</p>
        <p className="text-5xl font-black mt-1 relative">{loaded ? totalPoints : "..."}</p>
        <p className="text-white/80 text-xs mt-2 relative">
          {myRank > 0 ? `학급 ${myRank}등` : "참여 기록 없음"}
        </p>
      </div>

      {/* 학급 순위 */}
      <div className="md:col-span-2 rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
        <h3 className="font-black text-gray-800 text-sm mb-3">🏆 우리 반 순위</h3>
        {topStudents.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">아직 점수가 없어요</p>
        ) : (
          <div className="space-y-1.5">
            {topStudents.map((s, i) => {
              const isMe = s.id === myId;
              return (
                <div key={s.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5"
                  style={{ background: isMe ? "#ede9fe" : "transparent" }}>
                  <span className="text-sm w-7 text-center">
                    {["🥇", "🥈", "🥉"][i] ?? <span className="text-gray-400">{i + 1}</span>}
                  </span>
                  <span className={`flex-1 text-sm ${isMe ? "font-black text-indigo-700" : "text-gray-700"}`}>
                    {s.name}{isMe && <span className="text-xs ml-1">(나)</span>}
                  </span>
                  <span className="font-black text-sm text-indigo-600">{s.totalPoints}</span>
                </div>
              );
            })}
            {myRank > 5 && leaderboard && (
              <div className="flex items-center gap-3 rounded-lg px-2 py-1.5 bg-indigo-50 mt-1">
                <span className="text-sm w-7 text-center text-indigo-600">{myRank}</span>
                <span className="flex-1 text-sm font-black text-indigo-700">
                  {leaderboard.students[myRank - 1]?.name} (나)
                </span>
                <span className="font-black text-sm text-indigo-600">{totalPoints}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 최근 획득 */}
      {recent.length > 0 && (
        <div className="md:col-span-3 rounded-2xl p-5 bg-white border border-gray-100 shadow-sm">
          <h3 className="font-black text-gray-800 text-sm mb-3">📜 최근 받은 포인트</h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {recent.slice(0, 8).map((log) => {
              const b = bonusLabel(log.bonusType);
              return (
                <div key={log.id} className="flex items-center gap-3 text-sm py-1">
                  <span className="text-base">{b.emoji}</span>
                  <span className="text-gray-700 flex-shrink-0">{b.label}</span>
                  <span className="text-gray-400 text-xs flex-1 truncate">
                    · {GAME_LABEL[log.gameId] ?? log.gameId} · {log.reason}
                  </span>
                  <span className="text-gray-400 text-xs">{relativeTime(log.createdAt)}</span>
                  <span className="font-black text-indigo-600 w-12 text-right">+{log.points}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
