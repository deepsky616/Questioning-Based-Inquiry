"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dices, HelpCircle, LoaderCircle, MessageCircle } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { RoomHeader, WaitingBanner } from "./roomShared";
import RoomResult from "./RoomResult";
import { useAIPlay } from "./useAIPlay";
import {
  MEMORY_DIFFICULTY,
  parseAIBilingualPairs,
  pickFallbackLocalizedPairs,
  type MemoryDifficulty,
  type QAPair,
} from "@/lib/memory-game-data";
import {
  getLocalizedText,
  getMemoryDifficultyLabel,
  getQuestionGameText,
} from "@/lib/question-game-i18n";
import {
  readMemoryState,
  type MemoryCard,
  type MemoryRoomState,
} from "@/lib/question-game-room-engines/memory";
import type {
  BuiltInGame,
  GameRoom,
  RoomActionHandler,
} from "@/lib/question-games-data";

interface Props {
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  actionLoading: boolean;
  onAction: RoomActionHandler;
  onLeave: () => void;
}

const MAX_RESOLVE_RETRY_MS = 2_500;

function isRetryDelay(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function roomIdentity(code: string, createdAt: number) {
  return `${code}:${createdAt}`;
}

export default function RoomMemory({
  game,
  room,
  myId,
  actionLoading,
  onAction,
  onLeave,
}: Props) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const state = readMemoryState(room.gameState);
  const isHost = room.hostId === myId;
  const { ask, loading: aiLoading } = useAIPlay();
  const mountedRef = useRef(false);
  const identityRef = useRef(roomIdentity(room.code, room.createdAt));
  const preparingRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [pendingCardId, setPendingCardId] = useState<string | null>(null);

  useLayoutEffect(() => {
    identityRef.current = roomIdentity(room.code, room.createdAt);
  }, [room.code, room.createdAt]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    preparingRef.current = false;
    setPreparing(false);
    setRolling(false);
    setPendingCardId(null);
  }, [room.code, room.createdAt]);

  const missReveal =
    state?.phase === "play" && state.lastReveal?.result === "miss"
      ? state.lastReveal
      : null;
  const missKey =
    missReveal && room.playId && state?.roundId
      ? [
          room.code,
          room.createdAt,
          room.playId,
          state.roundId,
          missReveal.revealId,
        ].join(":")
      : null;
  const playId = room.playId;
  const roundId = state?.roundId;
  const revealId = missReveal?.revealId;

  useEffect(() => {
    if (!missKey || !playId || !roundId || !revealId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const commandId = crypto.randomUUID();
    const resolveMiss = async () => {
      const result = await onAction(
        "memory-resolve-miss",
        { playId, roundId, revealId },
        { commandId },
      );
      if (cancelled || !result.ok) return;
      const retryAfterMs = result.result?.retryAfterMs;
      if (!isRetryDelay(retryAfterMs)) return;
      timer = setTimeout(
        () => void resolveMiss(),
        Math.min(retryAfterMs, MAX_RESOLVE_RETRY_MS),
      );
    };

    void resolveMiss();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [missKey, onAction, playId, revealId, roundId]);

  async function prepareGame(difficulty: MemoryDifficulty) {
    if (
      preparingRef.current ||
      actionLoading ||
      !isHost ||
      !room.playId ||
      state?.phase !== "setup"
    ) {
      return;
    }

    const startedIdentity = roomIdentity(room.code, room.createdAt);
    preparingRef.current = true;
    setPreparing(true);
    try {
      const count = MEMORY_DIFFICULTY[difficulty].pairs;
      const response = await ask({
        action: "memory:pairs-bilingual",
        context: { count: String(count) },
        locale: "ko",
      }).catch(() => null);
      const pairs = response?.text
        ? parseAIBilingualPairs(response.text, count) ??
          pickFallbackLocalizedPairs(count)
        : pickFallbackLocalizedPairs(count);

      if (
        !mountedRef.current ||
        identityRef.current !== startedIdentity
      ) {
        return;
      }

      await onAction(
        "memory-prepare",
        {
          playId: room.playId,
          difficulty,
          pairs: pairs.map(({ question, answer, questionText, answerText }) => ({
            question,
            answer,
            questionText,
            answerText,
          })),
        },
        { commandId: crypto.randomUUID() },
      );
    } finally {
      preparingRef.current = false;
      if (
        mountedRef.current &&
        identityRef.current === startedIdentity
      ) {
        setPreparing(false);
      }
    }
  }

  async function rollDice() {
    if (
      rolling ||
      actionLoading ||
      state?.phase !== "rolling" ||
      state.diceRolls[myId] !== undefined ||
      !room.playId ||
      !state.roundId
    ) {
      return;
    }

    const startedIdentity = roomIdentity(room.code, room.createdAt);
    setRolling(true);
    try {
      await onAction(
        "memory-roll",
        { playId: room.playId, roundId: state.roundId },
        { commandId: crypto.randomUUID() },
      );
    } finally {
      if (
        mountedRef.current &&
        identityRef.current === startedIdentity
      ) {
        setRolling(false);
      }
    }
  }

  async function flipCard(card: MemoryCard) {
    if (
      actionLoading ||
      pendingCardId !== null ||
      state?.phase !== "play" ||
      !room.playId ||
      !state.roundId ||
      state.turnOrder[state.currentTurnIdx] !== myId ||
      state.lastReveal?.result === "miss" ||
      state.takenIds.includes(card.id) ||
      state.revealedIds.includes(card.id) ||
      (state.revealedIds.length === 0 && card.type !== "q") ||
      (state.revealedIds.length === 1 && card.type !== "a") ||
      state.revealedIds.length >= 2
    ) {
      return;
    }

    const startedIdentity = roomIdentity(room.code, room.createdAt);
    setPendingCardId(card.id);
    try {
      await onAction(
        "memory-flip",
        { playId: room.playId, roundId: state.roundId, cardId: card.id },
        { commandId: crypto.randomUUID() },
      );
    } finally {
      if (
        mountedRef.current &&
        identityRef.current === startedIdentity
      ) {
        setPendingCardId(null);
      }
    }
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <RoomHeader
          game={game}
          room={room}
          subtitle={text.preparing}
          onLeave={onLeave}
        />
        <WaitingBanner text={text.preparing} />
      </div>
    );
  }

  if (state.phase === "done" || room.status === "ended") {
    const scores = room.players.map((player) => ({
      playerId: player.id,
      name: player.name,
      score: state.scores[player.id] ?? 0,
    }));
    return (
      <RoomResult
        game={game}
        room={room}
        myId={myId}
        scoreLabel={locale === "en" ? "Pairs collected" : "모은 짝"}
        scoreUnit={locale === "en" ? " pairs" : "쌍"}
        scores={scores}
        questions={[]}
        onAction={onAction}
        onLeave={onLeave}
      />
    );
  }

  if (state.phase === "setup") {
    const isPreparing = preparing || aiLoading;
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <RoomHeader
          game={game}
          room={room}
          subtitle={text.memoryChooseDifficulty}
          onLeave={onLeave}
        />
        <section className="space-y-4 border-y border-border bg-card px-1 py-5 text-card-foreground sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black">{text.memoryChooseDifficulty}</h2>
            {isPreparing && (
              <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                {text.memoryGeneratingCards}
              </p>
            )}
          </div>
          {isHost ? (
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(MEMORY_DIFFICULTY) as MemoryDifficulty[]).map((difficulty) => {
                const settings = MEMORY_DIFFICULTY[difficulty];
                return (
                  <button
                    key={difficulty}
                    type="button"
                    onClick={() => void prepareGame(difficulty)}
                    disabled={isPreparing || actionLoading || !room.playId}
                    className="min-w-0 rounded-lg border-2 border-border bg-background p-3 text-foreground transition-colors hover:border-violet-500 disabled:cursor-wait disabled:bg-muted"
                  >
                    <span className="block text-sm font-black">
                      {getMemoryDifficultyLabel(locale, difficulty)}
                    </span>
                    <span className="mt-1 block text-lg font-black text-violet-700 dark:text-violet-300">
                      {settings.cards}{locale === "en" ? ` ${text.card}` : text.card}
                    </span>
                    <span className="block text-xs font-semibold text-muted-foreground">
                      {settings.pairs}{locale === "en" ? ` ${text.pair}` : text.pair}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <WaitingBanner
              text={locale === "en"
                ? "The host is choosing the difficulty."
                : "방장이 난이도를 고르는 중"}
            />
          )}
        </section>
      </div>
    );
  }

  if (state.phase === "rolling") {
    const myRoll = state.diceRolls[myId];
    const rolledCount = Object.keys(state.diceRolls).length;
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <RoomHeader
          game={game}
          room={room}
          subtitle={locale === "en" ? "Rolling for turn order" : "주사위로 차례 정하는 중"}
          onLeave={onLeave}
        />
        <section className="space-y-5 border-y border-border bg-card px-1 py-5 text-card-foreground sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-black">
              {locale === "en" ? "Dice results" : "주사위 결과"}
            </p>
            <p className="text-sm font-semibold text-muted-foreground">
              {rolledCount}/{room.players.length}
            </p>
          </div>

          {myRoll !== undefined ? (
            <div className="border-y border-violet-300 bg-violet-50 py-5 text-center text-violet-950 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-50">
              <p className="text-sm font-semibold">{locale === "en" ? "My die" : "내 주사위"}</p>
              <p className="mt-1 text-5xl font-black">{myRoll}</p>
            </div>
          ) : (
            <Button
              type="button"
              onClick={() => void rollDice()}
              disabled={rolling || actionLoading || !room.playId || !state.roundId}
              className="w-full rounded-lg bg-violet-700 py-5 font-black text-white hover:bg-violet-800 dark:bg-violet-500 dark:text-slate-950 dark:hover:bg-violet-400"
            >
              {rolling ? (
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Dices className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              {rolling ? text.preparing : text.diceRoll}
            </Button>
          )}

          <div className="divide-y divide-border border-y border-border">
            {room.players.map((player) => (
              <div key={player.id} className="flex items-center gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-bold text-foreground">
                  {player.name}{player.id === myId ? ` (${text.me})` : ""}
                </span>
                <span className="text-lg font-black text-violet-700 dark:text-violet-300">
                  {state.diceRolls[player.id] ?? "?"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const currentPlayerId = state.turnOrder[state.currentTurnIdx];
  const currentPlayer = room.players.find(({ id }) => id === currentPlayerId);
  const isMyTurn = currentPlayerId === myId;
  const waitingForMiss = state.lastReveal?.result === "miss";
  const requestPending = actionLoading || pendingCardId !== null;
  const inputLocked = !isMyTurn || waitingForMiss || requestPending;
  const remainingCards = state.qCards.length + state.aCards.length - state.takenIds.length;
  const status = waitingForMiss
    ? (locale === "en" ? "Returning cards face down" : "카드를 다시 덮는 중")
    : requestPending
      ? (locale === "en" ? "Sending move" : "요청 처리 중")
      : isMyTurn
        ? (locale === "en" ? "Your turn" : "내 차례")
        : (locale === "en" ? "Waiting for your turn" : "내 차례를 기다리는 중");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <RoomHeader
        game={game}
        room={room}
        subtitle={`${text.remainingCards(remainingCards)} · ${getMemoryDifficultyLabel(locale, state.difficulty)}`}
        onLeave={onLeave}
      />

      <section className="border-y border-border bg-card px-1 py-4 text-card-foreground sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-black text-foreground">
              {text.turnOf(currentPlayer?.name ?? "")}
            </p>
            <p aria-live="polite" className="mt-1 text-sm font-semibold text-muted-foreground">
              {status}
            </p>
          </div>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm font-black text-foreground">
            {locale === "en"
              ? `Attempts ${state.attempts}/${state.maxAttempts}`
              : `시도 ${state.attempts}/${state.maxAttempts}`}
          </p>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {room.players.map((player) => {
            const active = player.id === currentPlayerId;
            return (
              <div
                key={player.id}
                className={active
                  ? "flex shrink-0 items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-xs text-background"
                  : "flex shrink-0 items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-foreground"}
              >
                <span className="font-bold">{player.name}</span>
                <span className="font-black">{state.scores[player.id] ?? 0}</span>
              </div>
            );
          })}
        </div>
      </section>

      <MemoryCardSection
        kind="q"
        cards={state.qCards}
        state={state}
        locale={locale}
        disabled={inputLocked || state.revealedIds.length !== 0}
        pendingCardId={pendingCardId}
        onFlip={flipCard}
      />
      <MemoryCardSection
        kind="a"
        cards={state.aCards}
        state={state}
        locale={locale}
        disabled={inputLocked || state.revealedIds.length !== 1}
        pendingCardId={pendingCardId}
        onFlip={flipCard}
      />
    </div>
  );
}

function MemoryCardSection({
  kind,
  cards,
  state,
  locale,
  disabled,
  pendingCardId,
  onFlip,
}: {
  kind: "q" | "a";
  cards: MemoryCard[];
  state: MemoryRoomState;
  locale: string;
  disabled: boolean;
  pendingCardId: string | null;
  onFlip: (card: MemoryCard) => Promise<void>;
}) {
  const text = getQuestionGameText(locale);
  const title = kind === "q" ? text.questionCard : text.answerCard;
  const pairById = new Map(state.pairs.map((pair) => [pair.id, pair]));

  return (
    <section className="space-y-2">
      <h2 className={kind === "q"
        ? "text-sm font-black text-blue-800 dark:text-blue-200"
        : "text-sm font-black text-amber-800 dark:text-amber-200"}
      >
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map((card, index) => {
          const pair = pairById.get(card.pairId);
          const content = kind === "q"
            ? getLocalizedText(pair?.questionText, locale, pair?.question ?? "?")
            : getLocalizedText(pair?.answerText, locale, pair?.answer ?? "!");
          const revealed = state.revealedIds.includes(card.id);
          const taken = state.takenIds.includes(card.id);
          const visible = revealed || taken;
          const kindLabel = locale === "en"
            ? (kind === "q" ? "Question card" : "Answer card")
            : (kind === "q" ? "질문 카드" : "대답 카드");
          const accessibleLabel = taken
            ? (locale === "en"
              ? `Collected ${kindLabel.toLowerCase()}: ${content}`
              : `획득한 ${kindLabel}: ${content}`)
            : visible
              ? `${kindLabel}: ${content}`
              : `${kindLabel} ${index + 1}`;
          const colorClass = taken
            ? "border-slate-400 bg-slate-100 text-slate-950 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50"
            : visible && kind === "q"
              ? "border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-50"
              : visible
                ? "border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-50"
                : kind === "q"
                  ? "border-blue-900 bg-blue-700 text-white dark:border-blue-300 dark:bg-blue-600"
                  : "border-amber-700 bg-amber-400 text-slate-950 dark:border-amber-300 dark:bg-amber-300";

          return (
            <button
              key={card.id}
              type="button"
              aria-label={accessibleLabel}
              disabled={disabled || visible || pendingCardId !== null}
              onClick={() => void onFlip(card)}
              className={`flex min-h-28 min-w-0 items-center justify-center overflow-y-auto rounded-lg border-2 p-3 text-center transition-colors sm:min-h-32 ${colorClass}`}
            >
              {pendingCardId === card.id ? (
                <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
              ) : visible ? (
                <span className="w-full break-words text-xs font-bold leading-relaxed sm:text-sm">
                  {content}
                </span>
              ) : kind === "q" ? (
                <HelpCircle className="h-8 w-8" aria-hidden="true" />
              ) : (
                <MessageCircle className="h-8 w-8" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
