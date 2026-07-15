"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { RefreshCw, Share2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { RoomHeader, playerColorById } from "./roomShared";
import { GameResultReview } from "./GameResultReview";
import { AI_BONUS_TYPES, BonusKey, BASE_POINTS } from "@/lib/points-policy";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import {
  isGameAwardResult,
  type GameAward,
  type GameAwardResult,
} from "@/lib/game-award-result";
import type { BuiltInGame, GameRoom, RoomActionHandler } from "@/lib/question-games-data";

export interface ScoreEntry { playerId: string; name: string; score: number }
export interface QInfo { playerId: string; playerName: string; question: string }

type AwardRoomIdentity = Pick<GameRoom, "code" | "createdAt"> & {
  playId: string;
};

interface LocalAwardState {
  lifetimeKey: string;
  awardRoom: AwardRoomIdentity;
  result: GameAwardResult;
}

interface LifetimeErrorState {
  lifetimeKey: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAwardResult(value: unknown): GameAwardResult | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set([
    "awards",
    "bestQuestion",
    "summary",
    "alreadyAwarded",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
  if (
    value.alreadyAwarded !== undefined &&
    typeof value.alreadyAwarded !== "boolean"
  ) {
    return null;
  }
  const { alreadyAwarded: _alreadyAwarded, ...candidate } = value;
  return isGameAwardResult(candidate) ? candidate : null;
}

function lifetimeKeyOf(
  room: Pick<GameRoom, "code" | "createdAt" | "playId">,
) {
  return `${room.code}:${room.createdAt}:${room.playId ?? "legacy"}`;
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
  actionLoading: boolean;
  onAction: RoomActionHandler;
  onLeave: () => void;
}

export default function RoomResult({
  game, room, myId, scoreLabel, scoreUnit, scores, questions,
  actionLoading, onAction, onLeave,
}: Props) {
  const locale = useLocale();
  const { data: session, status: sessionStatus } = useSession();
  const text = getQuestionGameText(locale);
  const isHost = room.hostId === myId;
  const canManageAward =
    sessionStatus === "authenticated" &&
    session?.user.id === myId &&
    session.user.role === "TEACHER" &&
    isHost &&
    room.status === "ended" &&
    room.pointAwardKeyVersion === 2 &&
    room.pointEvidenceVersion === 2 &&
    typeof room.playId === "string" &&
    room.gameState.stateVersion === 2 &&
    room.gameState.phase === "done" &&
    room.gameState.endReason === "completed";
  const lifetimeKey = lifetimeKeyOf(room);
  const currentLifetimeRef = useRef(lifetimeKey);
  const mountedRef = useRef(false);
  const autoAttemptedRef = useRef<string | null>(null);
  const awardInFlightRef = useRef(new Set<string>());
  const publishInFlightRef = useRef(new Set<string>());
  const [localAwardState, setLocalAwardState] = useState<LocalAwardState | null>(null);
  const [awardErrorState, setAwardErrorState] = useState<LifetimeErrorState | null>(null);
  const [shareErrorState, setShareErrorState] = useState<LifetimeErrorState | null>(null);
  const [awardingLifetime, setAwardingLifetime] = useState<string | null>(null);
  const [publishingLifetime, setPublishingLifetime] = useState<string | null>(null);

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
  const sharedAward = isGameAwardResult(room.awardResult)
    ? room.awardResult
    : null;
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
  const publishing = publishingLifetime === lifetimeKey;
  const resultBusy = actionLoading || awarding || publishing;
  const award = sharedAward ?? localAward?.result ?? null;

  const publishAward = useCallback(async (
    awardRoom: AwardRoomIdentity,
    requestLifetimeKey: string,
  ) => {
    if (
      !mountedRef.current ||
      currentLifetimeRef.current !== requestLifetimeKey ||
      publishInFlightRef.current.has(requestLifetimeKey)
    ) return;
    publishInFlightRef.current.add(requestLifetimeKey);
    setPublishingLifetime(requestLifetimeKey);
    setShareErrorState((current) =>
      current?.lifetimeKey === requestLifetimeKey ? null : current
    );
    try {
      const shared = await onAction(
        "publish-award-result",
        { playId: awardRoom.playId },
        { expectedRoom: awardRoom },
      );
      if (
        !mountedRef.current ||
        currentLifetimeRef.current !== requestLifetimeKey
      ) return;
      if (!shared.ok) {
        setShareErrorState({
          lifetimeKey: requestLifetimeKey,
          message: text.shareFailed,
        });
      }
    } catch {
      if (
        mountedRef.current &&
        currentLifetimeRef.current === requestLifetimeKey
      ) {
        setShareErrorState({
          lifetimeKey: requestLifetimeKey,
          message: text.shareFailed,
        });
      }
    } finally {
      publishInFlightRef.current.delete(requestLifetimeKey);
      if (mountedRef.current) {
        setPublishingLifetime((current) =>
          current === requestLifetimeKey ? null : current
        );
      }
    }
  }, [onAction, text.shareFailed]);

  const requestAward = useCallback(async () => {
    if (!canManageAward || !room.playId) return;
    const awardRoom: AwardRoomIdentity = {
      code: room.code,
      createdAt: room.createdAt,
      playId: room.playId,
    };
    const requestLifetimeKey = lifetimeKeyOf(awardRoom);
    if (awardInFlightRef.current.has(requestLifetimeKey)) return;
    awardInFlightRef.current.add(requestLifetimeKey);
    if (
      mountedRef.current &&
      currentLifetimeRef.current === requestLifetimeKey
    ) {
      setAwardErrorState((current) =>
        current?.lifetimeKey === requestLifetimeKey ? null : current
      );
      setAwardingLifetime(requestLifetimeKey);
    }

    try {
      const response = await fetch("/api/points/award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: game.id,
          roomCode: awardRoom.code,
          roomCreatedAt: awardRoom.createdAt,
          playId: awardRoom.playId,
        }),
      });
      const value: unknown = await response.json().catch(() => null);
      const result = readAwardResult(value);
      if (!response.ok || !result) {
        throw new Error(text.awardRequestFailed);
      }
      if (
        !mountedRef.current ||
        currentLifetimeRef.current !== requestLifetimeKey
      ) return;
      setLocalAwardState({
        lifetimeKey: requestLifetimeKey,
        awardRoom,
        result,
      });
      await publishAward(awardRoom, requestLifetimeKey);
    } catch {
      if (
        mountedRef.current &&
        currentLifetimeRef.current === requestLifetimeKey
      ) {
        setAwardErrorState({
          lifetimeKey: requestLifetimeKey,
          message: text.awardFailed,
        });
      }
    } finally {
      awardInFlightRef.current.delete(requestLifetimeKey);
      if (mountedRef.current) {
        setAwardingLifetime((current) =>
          current === requestLifetimeKey ? null : current
        );
      }
    }
  }, [canManageAward, game.id, publishAward, room.code, room.createdAt, room.playId, text.awardFailed, text.awardRequestFailed]);

  // 방장 자동 지급 (방 수명마다 1회)
  useEffect(() => {
    if (
      !canManageAward ||
      sharedAward ||
      autoAttemptedRef.current === lifetimeKey
    ) return;
    autoAttemptedRef.current = lifetimeKey;
    void requestAward();
  }, [canManageAward, lifetimeKey, requestAward, sharedAward]);

  // 학생별 총 포인트 / 받은 상 집계
  const pointsByPlayer: Record<string, number> = {};
  const bonusesByPlayer: Record<string, GameAward[]> = {};
  for (const a of award?.awards ?? []) {
    pointsByPlayer[a.studentId] = (pointsByPlayer[a.studentId] ?? 0) + a.points;
    if (!bonusesByPlayer[a.studentId]) bonusesByPlayer[a.studentId] = [];
    bonusesByPlayer[a.studentId].push(a);
  }

  const bestQ = award?.bestQuestion;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <RoomHeader
        game={game}
        room={room}
        subtitle={text.gameEnded}
        onLeave={onLeave}
        disabled={resultBusy}
      />

      {/* 우승자 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-3">
        <div className="text-6xl">🏆</div>
        {winnersSet.size > 0 ? (
          <>
            <h2 className="text-2xl font-black text-gray-800">
              {winnersSet.size === 1 ? text.winner : text.jointWinner}
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
          <h2 className="text-xl font-black text-gray-600">{text.everyoneDidWell}</h2>
        )}
      </div>

      {/* 점수판 (게임 내 활동) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-2">
        <h3 className="font-black text-gray-700 mb-1">{text.scoreboard}</h3>
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
                {s.name}{s.playerId === myId && <span className="text-xs text-gray-400 ml-1">({text.me})</span>}
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
          {text.pointAnalysis}
        </h3>

        {!award && awarding && (
          <div className="flex items-center gap-3 text-gray-500 text-sm py-4">
            <span className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            {text.analyzingPoints}
          </div>
        )}

        {!award && !awarding && awardError && canManageAward && (
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
              {text.retryPoints}
            </Button>
          </div>
        )}

        {!award && !awarding && !canManageAward && (
          <p className="text-gray-400 text-sm text-center py-4">
            {text.waitingPointAnalysis}
          </p>
        )}

        {award && (
          <>
            {award.summary && (
              <p className="text-gray-600 text-sm bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                💬 {award.summary}
              </p>
            )}

            {shareError && localAward && !sharedAward && canManageAward && (
              <div className="space-y-3 py-1">
                <p role="alert" className="text-sm text-red-600 text-center">
                  {shareError}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={publishing}
                  onClick={() => void publishAward(
                    localAward.awardRoom,
                    localAward.lifetimeKey,
                  )}
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  {text.shareResultAgain}
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
                        {s.name}{s.playerId === myId && <span className="text-xs text-gray-400 ml-1">({text.me})</span>}
                      </span>
                      <span className="font-black text-base" style={{ color: game.accentColor }}>
                        +{pts}{locale === "en" ? " pts" : "점"}
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
                  {text.bestQuestion}
                </p>
                <p className="text-gray-800 font-bold">&ldquo;{bestQ.question}&rdquo;</p>
                <p className="text-gray-500 text-xs">💬 {bestQ.reason}</p>
              </div>
            )}

            <p className="text-xs text-gray-400 text-center pt-1">
              {text.pointBase}: {text.participation} {BASE_POINTS.PARTICIPATION},
              {text.perValidQuestion} {BASE_POINTS.PER_VALID_QUESTION},
              {text.completion} {BASE_POINTS.COMPLETION}, {text.winnerBonus} {BASE_POINTS.WINNER_BONUS}
            </p>
          </>
        )}
      </div>

      {/* 우리가 만든 질문 정리 */}
      <GameResultReview
        title={text.madeQuestions}
        accentColor={game.accentColor}
        entries={questions.map((q) => ({ q: `${q.playerName} · ${q.question}` }))}
      />

      {/* 대기실 복귀 */}
      {isHost ? (
        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          disabled={resultBusy}
          onClick={() => {
            if (!resultBusy) void onAction("restart");
          }}>
          {text.returnLobby}
        </Button>
      ) : (
        <p className="text-center text-gray-400 text-sm">{text.waitingHost}</p>
      )}
    </div>
  );
}
