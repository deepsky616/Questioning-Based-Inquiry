"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoomHeader, playerColorById } from "./roomShared";
import { GameResultReview } from "./GameResultReview";
import { AI_BONUS_TYPES, BonusKey, SYSTEM_BONUS, BASE_POINTS } from "@/lib/points-policy";
import type { BuiltInGame, GameRoom, RoomActionHandler } from "@/lib/question-games-data";

export interface ScoreEntry { playerId: string; name: string; score: number }
export interface QInfo { playerId: string; playerName: string; question: string }

interface AwardLog { studentId: string; bonusType: string; points: number; reason: string }
interface AwardResponse {
  awards: AwardLog[];
  bestQuestion?: { studentId: string; question: string; reason: string };
  summary?: string;
  alreadyAwarded?: boolean;
}

interface LocalAwardState {
  lifetimeKey: string;
  awardRoom: Pick<GameRoom, "code" | "createdAt">;
  result: AwardResponse;
}

interface LifetimeErrorState {
  lifetimeKey: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAwardResponse(value: unknown): value is AwardResponse {
  if (!isRecord(value) || !Array.isArray(value.awards)) return false;
  if (!value.awards.every((award) =>
    isRecord(award) &&
    typeof award.studentId === "string" &&
    typeof award.bonusType === "string" &&
    typeof award.points === "number" &&
    Number.isFinite(award.points) &&
    typeof award.reason === "string"
  )) return false;
  if (value.summary !== undefined && typeof value.summary !== "string") return false;
  if (value.alreadyAwarded !== undefined && typeof value.alreadyAwarded !== "boolean") {
    return false;
  }
  if (value.bestQuestion !== undefined) {
    if (
      !isRecord(value.bestQuestion) ||
      typeof value.bestQuestion.studentId !== "string" ||
      typeof value.bestQuestion.question !== "string" ||
      typeof value.bestQuestion.reason !== "string"
    ) return false;
  }
  return true;
}

function lifetimeKeyOf(room: Pick<GameRoom, "code" | "createdAt">) {
  return `${room.code}:${room.createdAt}`;
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
  onAction: RoomActionHandler;
  onLeave: () => void;
}

export default function RoomResult({
  game, room, myId, scoreLabel, scoreUnit, scores, questions, onAction, onLeave,
}: Props) {
  const isHost = room.hostId === myId;
  const lifetimeKey = lifetimeKeyOf(room);
  const currentLifetimeRef = useRef(lifetimeKey);
  const mountedRef = useRef(false);
  const autoAttemptedRef = useRef<string | null>(null);
  const inFlightRef = useRef(new Set<string>());
  const [localAwardState, setLocalAwardState] = useState<LocalAwardState | null>(null);
  const [awardErrorState, setAwardErrorState] = useState<LifetimeErrorState | null>(null);
  const [shareErrorState, setShareErrorState] = useState<LifetimeErrorState | null>(null);
  const [awardingLifetime, setAwardingLifetime] = useState<string | null>(null);

  useLayoutEffect(() => {
    currentLifetimeRef.current = lifetimeKey;
  }, [lifetimeKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 점수표 (게임 내 활동 점수) → 우승 판정
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const winnersSet = new Set(
    topScore > 0 ? sorted.filter((s) => s.score === topScore).map((s) => s.playerId) : []
  );

  // 방에 저장된 지급 결과 (다른 참가자도 보이게)
  const sharedCandidate = (room.gameState as { awardResult?: unknown }).awardResult;
  const sharedAward = isAwardResponse(sharedCandidate) ? sharedCandidate : null;
  const localAward = localAwardState?.lifetimeKey === lifetimeKey
    ? localAwardState
    : null;
  const awardError = awardErrorState?.lifetimeKey === lifetimeKey
    ? awardErrorState.message
    : null;
  const shareError = shareErrorState?.lifetimeKey === lifetimeKey
    ? shareErrorState.message
    : null;
  const awarding = awardingLifetime === lifetimeKey;
  const award = sharedAward ?? localAward?.result ?? null;

  const shareAward = useCallback(async (
    result: AwardResponse,
    awardRoom: Pick<GameRoom, "code" | "createdAt">,
    requestLifetimeKey: string,
  ) => {
    if (
      !mountedRef.current ||
      currentLifetimeRef.current !== requestLifetimeKey
    ) return;
    setShareErrorState((current) =>
      current?.lifetimeKey === requestLifetimeKey ? null : current
    );
    try {
      const shared = await onAction(
        "update-state",
        { patch: { awardResult: result } },
        { expectedRoom: awardRoom },
      );
      if (
        !mountedRef.current ||
        currentLifetimeRef.current !== requestLifetimeKey
      ) return;
      if (!shared.ok) {
        setShareErrorState({
          lifetimeKey: requestLifetimeKey,
          message: "결과를 방에 공유하지 못했어요.",
        });
      }
    } catch {
      if (
        mountedRef.current &&
        currentLifetimeRef.current === requestLifetimeKey
      ) {
        setShareErrorState({
          lifetimeKey: requestLifetimeKey,
          message: "결과를 방에 공유하지 못했어요.",
        });
      }
    }
  }, [onAction]);

  const requestAward = useCallback(async () => {
    const awardRoom = { code: room.code, createdAt: room.createdAt };
    const requestLifetimeKey = lifetimeKeyOf(awardRoom);
    if (inFlightRef.current.has(requestLifetimeKey)) return;
    inFlightRef.current.add(requestLifetimeKey);
    if (
      mountedRef.current &&
      currentLifetimeRef.current === requestLifetimeKey
    ) {
      setAwardErrorState((current) =>
        current?.lifetimeKey === requestLifetimeKey ? null : current
      );
      setAwardingLifetime(requestLifetimeKey);
    }

    const contributions = scores.map((score) => ({
      studentId: score.playerId,
      studentName: score.name,
      validQuestions: game.id === "bingo" ? 0 : score.score,
      questions: questions
        .filter((question) => question.playerId === score.playerId)
        .map((question) => question.question),
      isWinner: topScore > 0 && score.score === topScore,
    }));

    try {
      const response = await fetch("/api/points/award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: game.id,
          roomCode: awardRoom.code,
          roomCreatedAt: awardRoom.createdAt,
          topic: room.topic,
          contributions,
        }),
      });
      const value: unknown = await response.json().catch(() => null);
      if (!response.ok || !isAwardResponse(value)) {
        throw new Error("포인트 지급 실패");
      }
      if (
        !mountedRef.current ||
        currentLifetimeRef.current !== requestLifetimeKey
      ) return;
      setLocalAwardState({
        lifetimeKey: requestLifetimeKey,
        awardRoom,
        result: value,
      });
      await shareAward(value, awardRoom, requestLifetimeKey);
    } catch {
      if (
        mountedRef.current &&
        currentLifetimeRef.current === requestLifetimeKey
      ) {
        setAwardErrorState({
          lifetimeKey: requestLifetimeKey,
          message: "포인트를 받지 못했어요.",
        });
      }
    } finally {
      inFlightRef.current.delete(requestLifetimeKey);
      if (mountedRef.current) {
        setAwardingLifetime((current) =>
          current === requestLifetimeKey ? null : current
        );
      }
    }
  }, [game.id, questions, room.code, room.createdAt, room.topic, scores, shareAward, topScore]);

  // 방장 자동 지급 (방 수명마다 1회)
  useEffect(() => {
    if (
      !isHost ||
      sharedAward ||
      autoAttemptedRef.current === lifetimeKey
    ) return;
    autoAttemptedRef.current = lifetimeKey;
    void requestAward();
  }, [isHost, lifetimeKey, requestAward, sharedAward]);

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

        {!award && !awarding && awardError && isHost && (
          <div className="space-y-3 py-2">
            <p role="alert" className="text-sm text-red-600 text-center">
              {awardError}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => void requestAward()}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              포인트 다시 받기
            </Button>
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

            {shareError && localAward && !sharedAward && isHost && (
              <div className="space-y-3 py-1">
                <p role="alert" className="text-sm text-red-600 text-center">
                  {shareError}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => void shareAward(
                    localAward.result,
                    localAward.awardRoom,
                    localAward.lifetimeKey,
                  )}
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  결과 다시 공유
                </Button>
              </div>
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
          onClick={() => void onAction("restart")}>
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
