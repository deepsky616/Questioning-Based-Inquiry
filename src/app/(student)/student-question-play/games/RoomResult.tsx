"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { RefreshCw, Share2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { usePointBonusLabel } from "@/components/shared/use-point-label";
import { RoomHeader, playerColorById } from "./roomShared";
import { GameResultReview } from "./GameResultReview";
import { GameLearningSummary } from "./GameLearningSummary";
import {
  AI_BONUS_TYPES,
  BASE_POINTS,
  GAME_OUTCOME_BONUS_TYPES,
  type BonusKey,
} from "@/lib/points-policy";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import { getQuestionGameRule } from "@/lib/question-game-rules";
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
    "settlement",
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
  details?: ReactNode;
  actionLoading: boolean;
  onAction: RoomActionHandler;
  onLeave: () => void;
  onRestart?: () => void;
  restartLabel?: string;
  waitingLabel?: string;
}

export default function RoomResult({
  game, room, myId, scoreLabel, scoreUnit, scores, questions, details,
  actionLoading, onAction, onLeave, onRestart, restartLabel, waitingLabel,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("gamePlay");
  const { label: bonusLabel } = usePointBonusLabel();
  const queryClient = useQueryClient();
  const { data: session, status: sessionStatus } = useSession();
  const text = getQuestionGameText(locale);
  const isHost = room.hostId === myId;
  const competitiveWinner = getQuestionGameRule(game.id).score.competitiveWinner;
  const canRecoverAward =
    sessionStatus === "authenticated" &&
    session?.user.id === myId &&
    room.players.some((player) => player.id === myId) &&
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
    competitiveWinner && topScore > 0
      ? sorted.filter((s) => s.score === topScore).map((s) => s.playerId)
      : [],
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
  const showPointAnalysis = canRecoverAward || award !== null;

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
    if (!canRecoverAward || !room.playId) return;
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
      if (result.awards.some(({ points }) => points > 0)) {
        void queryClient.invalidateQueries({ queryKey: ["points-card"] });
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
  }, [canRecoverAward, game.id, publishAward, queryClient, room.code, room.createdAt, room.playId, text.awardFailed, text.awardRequestFailed]);

  // 완료된 실행의 포인트 지급 상태를 참가자 화면마다 한 번 확인한다.
  useEffect(() => {
    if (
      !canRecoverAward ||
      sharedAward ||
      autoAttemptedRef.current === lifetimeKey
    ) return;
    autoAttemptedRef.current = lifetimeKey;
    void requestAward();
  }, [canRecoverAward, lifetimeKey, requestAward, sharedAward]);

  // 학생별 총 포인트 / 받은 상 집계
  const pointsByPlayer: Record<string, number> = {};
  const bonusesByPlayer: Record<string, GameAward[]> = {};
  for (const a of award?.awards ?? []) {
    pointsByPlayer[a.studentId] = (pointsByPlayer[a.studentId] ?? 0) + a.points;
    if (!bonusesByPlayer[a.studentId]) bonusesByPlayer[a.studentId] = [];
    bonusesByPlayer[a.studentId].push(a);
  }

  const bestQ = award?.bestQuestion;
  const myQuestions = questions
    .filter((question) => question.playerId === myId)
    .map((question) => question.question);
  const myActivityCount = Math.max(
    myQuestions.length,
    scores.find((score) => score.playerId === myId)?.score ?? 0,
  );

  return (
    <div className={`${details ? "max-w-4xl" : "max-w-lg"} mx-auto space-y-5`}>
      <RoomHeader
        game={game}
        room={room}
        subtitle={text.gameEnded}
        onLeave={onLeave}
        disabled={resultBusy}
      />

      {/* 우승자 */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-8 flex flex-col items-center gap-3">
        <div className="text-6xl">{competitiveWinner ? "🏆" : "✅"}</div>
        {winnersSet.size > 0 ? (
          <>
            <h2 className="text-2xl font-black text-foreground">
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
            <p className="text-muted-foreground text-sm">{topScore}{scoreUnit} {scoreLabel}</p>
          </>
        ) : (
          <h2 className="text-xl font-black text-foreground">{text.everyoneDidWell}</h2>
        )}
      </div>

      {/* 점수판 (게임 내 활동) */}
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-5 space-y-2">
        <h3 className="font-black text-foreground mb-1">{text.scoreboard}</h3>
        {sorted.map((s, i) => {
          const isWinner = winnersSet.has(s.playerId);
          return (
            <div key={s.playerId}
              className="flex items-center gap-3 rounded-xl p-3"
              style={{ background: isWinner ? `${game.accentColor}12` : "hsl(var(--muted))" }}>
              <span className="text-lg w-6 text-center">
                {competitiveWinner ? (MEDALS[i] ?? `${i + 1}`) : i + 1}
              </span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm"
                style={{ background: playerColorById(room, s.playerId) }}>
                {s.name.charAt(0)}
              </div>
              <span className="font-bold text-foreground flex-1">
                {s.name}{s.playerId === myId && <span className="text-xs text-secondary-foreground ml-1">({text.me})</span>}
              </span>
              <span className="font-black text-foreground">
                {s.score}{scoreUnit}
              </span>
            </div>
          );
        })}
      </div>

      {/* 포인트 분석 */}
      {showPointAnalysis && (
      <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-5 space-y-3">
        <h3 className="font-black text-foreground flex items-center gap-2">
          {text.pointAnalysis}
        </h3>

        {!award && awarding && (
          <div className="flex items-center gap-3 text-muted-foreground text-sm py-4">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            {text.analyzingPoints}
          </div>
        )}

        {!award && !awarding && awardError && canRecoverAward && (
          <div className="space-y-3 py-2">
            <p role="alert" className="text-sm text-red-700 dark:text-red-300 text-center">
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

        {!award && !awarding && !canRecoverAward && (
          <p className="text-muted-foreground text-sm text-center py-4">
            {text.waitingPointAnalysis}
          </p>
        )}

        {award && (
          <>
            {award.summary && (
              <p className="text-foreground text-sm bg-secondary border border-border rounded-xl px-4 py-3">
                💬 {award.summary}
              </p>
            )}

            {shareError && localAward && !sharedAward && canRecoverAward && (
              <div className="space-y-3 py-1">
                <p role="alert" className="text-sm text-red-700 dark:text-red-300 text-center">
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
                const highlightedBonuses = bonuses.filter((b) =>
                  b.bonusType in AI_BONUS_TYPES ||
                  b.bonusType in GAME_OUTCOME_BONUS_TYPES
                );
                return (
                  <div key={s.playerId}
                    className="rounded-xl p-3 border border-border space-y-1.5"
                    style={{ background: s.playerId === myId ? `${game.accentColor}08` : "hsl(var(--card))" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-xs"
                        style={{ background: playerColorById(room, s.playerId) }}>
                        {s.name.charAt(0)}
                      </div>
                      <span className="font-bold text-foreground flex-1 text-sm">
                        {s.name}{s.playerId === myId && <span className="text-xs text-secondary-foreground ml-1">({text.me})</span>}
                      </span>
                      <span className="font-black text-base text-foreground">
                        +{pts}{t("pts")}
                      </span>
                    </div>
                    {highlightedBonuses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-9">
                        {highlightedBonuses.map((b, i) => {
                          const display = bonusLabel(b.bonusType);
                          return (
                            <span key={i}
                              className="text-xs font-medium text-foreground px-2 py-0.5 rounded-full"
                              style={{ background: `${game.accentColor}15` }}>
                              {display.emoji} {display.label} +{b.points}
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
              <div className="bg-secondary border-2 border-border rounded-xl p-4 space-y-2">
                <p className="text-amber-700 dark:text-amber-300 font-black text-sm flex items-center gap-1">
                  {text.bestQuestion}
                </p>
                <p className="text-foreground font-bold">&ldquo;{bestQ.question}&rdquo;</p>
                <p className="text-secondary-foreground text-xs">💬 {bestQ.reason}</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center pt-1">
              {text.pointBase}: {text.participation} {BASE_POINTS.PARTICIPATION},
              {text.perValidQuestion} {BASE_POINTS.PER_VALID_QUESTION},
              {text.completion} {BASE_POINTS.COMPLETION}
              {competitiveWinner
                ? `, ${text.winnerBonus} ${BASE_POINTS.WINNER_BONUS}`
                : null}
            </p>
          </>
        )}
      </div>
      )}

      <GameLearningSummary
        mode="friend"
        completedActivities={myActivityCount}
        questions={myQuestions}
        points={award ? pointsByPlayer[myId] ?? 0 : undefined}
        accentColor={game.accentColor}
      />

      {/* 우리가 만든 질문 정리 */}
      {details ?? (
        <GameResultReview
          title={text.madeQuestions}
          accentColor={game.accentColor}
          entries={questions.map((q) => ({ q: `${q.playerName} · ${q.question}` }))}
        />
      )}

      {/* 대기실 복귀 */}
      {isHost ? (
        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          disabled={resultBusy}
          onClick={() => {
            if (resultBusy) return;
            if (onRestart) {
              onRestart();
            } else {
              void onAction("restart");
            }
          }}>
          {restartLabel ?? text.returnLobby}
        </Button>
      ) : (
        <p className="text-center text-muted-foreground text-sm">
          {waitingLabel ?? text.waitingHost}
        </p>
      )}
    </div>
  );
}
