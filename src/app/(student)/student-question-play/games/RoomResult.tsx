"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RoomHeader, playerColorById } from "./roomShared";
import { GameResultReview } from "./GameResultReview";
import { AI_BONUS_TYPES, BonusKey, SYSTEM_BONUS, BASE_POINTS } from "@/lib/points-policy";
import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";

export interface ScoreEntry { playerId: string; name: string; score: number }
export interface QInfo { playerId: string; playerName: string; question: string }

interface AwardLog { studentId: string; bonusType: string; points: number; reason: string }
interface AwardResponse {
  awards: AwardLog[];
  bestQuestion?: { studentId: string; question: string; reason: string };
  summary?: string;
  alreadyAwarded?: boolean;
}

const MEDALS = ["🥇", "🥈", "🥉"];

interface Props {
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  scoreLabel: string;
  scoreUnit: string;
  scores: ScoreEntry[];
  questions: QInfo[];
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<GameRoom | null>;
  onLeave: () => void;
}

export default function RoomResult({
  game, room, myId, scoreLabel, scoreUnit, scores, questions, onAction, onLeave,
}: Props) {
  const isHost = room.hostId === myId;
  const awardedRef = useRef(false);
  const [localAward, setLocalAward] = useState<AwardResponse | null>(null);
  const [awarding, setAwarding] = useState(false);

  // 점수표 (게임 내 활동 점수) → 우승 판정
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const winnersSet = new Set(
    topScore > 0 ? sorted.filter((s) => s.score === topScore).map((s) => s.playerId) : []
  );

  // 방에 저장된 지급 결과 (다른 참가자도 보이게)
  const sharedAward = (room.gameState as { awardResult?: AwardResponse }).awardResult;
  const award = sharedAward ?? localAward;

  // 방장 자동 지급 (1회)
  useEffect(() => {
    if (!isHost || awardedRef.current || sharedAward || awarding) return;
    awardedRef.current = true;
    setAwarding(true);

    const contributions = scores.map((s) => ({
      studentId: s.playerId,
      studentName: s.name,
      // 빙고는 점수가 순위 점수라 의미가 다름 → 유효 질문 0으로
      validQuestions: game.id === "bingo" ? 0 : s.score,
      questions: questions.filter((q) => q.playerId === s.playerId).map((q) => q.question),
      isWinner: winnersSet.has(s.playerId),
    }));

    fetch("/api/points/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: game.id,
        roomCode: room.code,
        topic: room.topic,
        contributions,
      }),
    })
      .then((r) => r.json())
      .then((data: AwardResponse) => {
        setLocalAward(data);
        onAction("update-state", { patch: { awardResult: data } });
      })
      .catch(() => {})
      .finally(() => setAwarding(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, sharedAward]);

  // 학생별 총 포인트 / 받은 상 집계
  const pointsByPlayer: Record<string, number> = {};
  const bonusesByPlayer: Record<string, AwardLog[]> = {};
  for (const a of award?.awards ?? []) {
    pointsByPlayer[a.studentId] = (pointsByPlayer[a.studentId] ?? 0) + a.points;
    if (!bonusesByPlayer[a.studentId]) bonusesByPlayer[a.studentId] = [];
    bonusesByPlayer[a.studentId].push(a);
  }

  const bestQ = award?.bestQuestion;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <RoomHeader game={game} room={room} subtitle="게임 종료!" onLeave={onLeave} />

      {/* 우승자 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-3">
        <div className="text-6xl">🏆</div>
        {winnersSet.size > 0 ? (
          <>
            <h2 className="text-2xl font-black text-gray-800">
              {winnersSet.size === 1 ? "우승!" : "공동 우승!"}
            </h2>
            <div className="flex flex-wrap justify-center gap-2">
              {sorted.filter((s) => winnersSet.has(s.playerId)).map((w) => (
                <span key={w.playerId}
                  className="px-4 py-2 rounded-full text-white font-black text-lg"
                  style={{ background: game.gradientCss }}>
                  👑 {w.name}
                </span>
              ))}
            </div>
            <p className="text-gray-400 text-sm">{topScore}{scoreUnit} {scoreLabel}</p>
          </>
        ) : (
          <h2 className="text-xl font-black text-gray-600">모두 수고했어요!</h2>
        )}
      </div>

      {/* 점수판 (게임 내 활동) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-2">
        <h3 className="font-black text-gray-700 mb-1">📊 게임 점수표</h3>
        {sorted.map((s, i) => {
          const isWinner = winnersSet.has(s.playerId);
          return (
            <div key={s.playerId}
              className="flex items-center gap-3 rounded-xl p-3"
              style={{ background: isWinner ? `${game.accentColor}12` : "hsl(var(--muted))" }}>
              <span className="text-lg w-6 text-center">{MEDALS[i] ?? `${i + 1}`}</span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm"
                style={{ background: playerColorById(room, s.playerId) }}>
                {s.name.charAt(0)}
              </div>
              <span className="font-bold text-gray-800 flex-1">
                {s.name}{s.playerId === myId && <span className="text-xs text-gray-400 ml-1">(나)</span>}
              </span>
              <span className="font-black" style={{ color: game.accentColor }}>
                {s.score}{scoreUnit}
              </span>
            </div>
          );
        })}
      </div>

      {/* 포인트 분석 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="font-black text-gray-700 flex items-center gap-2">
          🤖 AI 포인트 분석
        </h3>

        {!award && awarding && (
          <div className="flex items-center gap-3 text-gray-500 text-sm py-4">
            <span className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            AI가 게임을 분석하고 포인트를 나눠주는 중...
          </div>
        )}

        {!award && !awarding && !isHost && (
          <p className="text-gray-400 text-sm text-center py-4">
            방장 화면에서 AI 분석이 진행 중이에요...
          </p>
        )}

        {award && (
          <>
            {award.summary && (
              <p className="text-gray-600 text-sm bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                💬 {award.summary}
              </p>
            )}

            {/* 학생별 포인트 + 상 */}
            <div className="space-y-2">
              {sorted.map((s) => {
                const pts = pointsByPlayer[s.playerId] ?? 0;
                const bonuses = bonusesByPlayer[s.playerId] ?? [];
                const aiBonuses = bonuses.filter((b) => b.bonusType in AI_BONUS_TYPES);
                return (
                  <div key={s.playerId}
                    className="rounded-xl p-3 border border-gray-100 space-y-1.5"
                    style={{ background: s.playerId === myId ? `${game.accentColor}08` : "hsl(var(--card))" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-xs"
                        style={{ background: playerColorById(room, s.playerId) }}>
                        {s.name.charAt(0)}
                      </div>
                      <span className="font-bold text-gray-800 flex-1 text-sm">
                        {s.name}{s.playerId === myId && <span className="text-xs text-gray-400 ml-1">(나)</span>}
                      </span>
                      <span className="font-black text-base" style={{ color: game.accentColor }}>
                        +{pts}점
                      </span>
                    </div>
                    {aiBonuses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-9">
                        {aiBonuses.map((b, i) => {
                          const def = AI_BONUS_TYPES[b.bonusType as BonusKey];
                          return (
                            <span key={i}
                              className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{ background: `${game.accentColor}15`, color: game.accentColor }}>
                              {def.emoji} {def.label} +{def.points}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 베스트 질문 */}
            {bestQ && (
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-4 space-y-2">
                <p className="text-yellow-600 font-black text-sm flex items-center gap-1">
                  🏆 베스트 질문
                </p>
                <p className="text-gray-800 font-bold">&ldquo;{bestQ.question}&rdquo;</p>
                <p className="text-gray-500 text-xs">💬 {bestQ.reason}</p>
              </div>
            )}

            <p className="text-xs text-gray-400 text-center pt-1">
              기본 점수: 참여 {BASE_POINTS.PARTICIPATION}점, 유효 질문당 {BASE_POINTS.PER_VALID_QUESTION}점,
              완료 {BASE_POINTS.COMPLETION}점, 우승 {BASE_POINTS.WINNER_BONUS}점
            </p>
          </>
        )}
      </div>

      {/* 우리가 만든 질문 정리 */}
      <GameResultReview
        title="📋 우리가 만든 질문"
        accentColor={game.accentColor}
        entries={questions.map((q) => ({ q: `${q.playerName} · ${q.question}` }))}
      />

      {/* 대기실 복귀 */}
      {isHost ? (
        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          onClick={() => onAction("restart")}>
          🔄 대기실로 돌아가기
        </Button>
      ) : (
        <p className="text-center text-gray-400 text-sm">방장이 다음 게임을 준비하고 있어요...</p>
      )}
    </div>
  );
}
// SYSTEM_BONUS는 표시에 사용하지 않지만 향후 확장용 유지
void SYSTEM_BONUS;
