"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { GameHeader } from "./GameHeader";
import { useAIPlay } from "./useAIPlay";
import { GameResultReview } from "./GameResultReview";
import {
  MEMORY_DIFFICULTY, MemoryDifficulty, QAPair,
  pickFallbackPairs, parseAIPairs, shuffle,
} from "@/lib/memory-game-data";
import { getMemoryDifficultyLabel, getQuestionGameText } from "@/lib/question-game-i18n";
import { QUESTION_GAME_RULES } from "@/lib/question-game-rules";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

interface Card {
  id: string;
  pairId: string;
  type: "q" | "a";
}

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

const MISS_DELAY = 1800;
const AI_NAME = "🤖 AI";
const AI_THINK_MS = 1200;

export default function MemoryGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const { mode } = config;
  const isAI = mode === "ai";
  const isSolo = mode === "solo";

  // 참가자 구성
  const playersList = (() => {
    if (isSolo) return [config.players[0]?.trim() || text.me];
    if (isAI) return [config.players[0]?.trim() || text.me, AI_NAME];
    return config.players.length > 0 ? config.players : [text.me];
  })();
  const hasOpponents = playersList.length > 1;

  const [phase, setPhase] = useState<"setup" | "generating" | "play" | "done">("setup");
  const [difficulty, setDifficulty] = useState<MemoryDifficulty>("normal");
  const maximumAttempts = QUESTION_GAME_RULES.memory.targets[
    isAI ? "ai" : "solo"
  ][difficulty];
  const [pairs, setPairs] = useState<QAPair[]>([]);
  const [qCards, setQCards] = useState<Card[]>([]);
  const [aCards, setACards] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [taken, setTaken] = useState<string[]>([]);
  const [tries, setTries] = useState(0);
  // 차례 + 점수 (멀티/AI 모드)
  const [turnIdx, setTurnIdx] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(playersList.map((p) => [p, 0]))
  );

  // AI 기억력: 본 카드들의 (id, pairId)
  const seenRef = useRef<Map<string, string>>(new Map());

  const { ask, loading: aiLoading } = useAIPlay();
  const missTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPlayer = playersList[turnIdx % playersList.length] ?? text.me;
  const isAITurn = isAI && currentPlayer === AI_NAME;
  const isHumanTurn = !isAITurn;

  /* 난이도 + 페어 생성 */
  async function startGame(diff: MemoryDifficulty) {
    setDifficulty(diff);
    setPhase("generating");
    const cfg = MEMORY_DIFFICULTY[diff];
    const res = await ask({ action: "memory:pairs", context: { count: String(cfg.pairs) } });
    let p: QAPair[] | null = null;
    if (res?.text) p = parseAIPairs(res.text, cfg.pairs);
    if (!p) p = pickFallbackPairs(cfg.pairs, locale);

    const q: Card[] = p.map((pp, i) => ({ id: `q-${i}`, pairId: pp.id, type: "q" }));
    const a: Card[] = p.map((pp, i) => ({ id: `a-${i}`, pairId: pp.id, type: "a" }));
    setPairs(p);
    setQCards(shuffle(q));
    setACards(shuffle(a));
    setRevealed([]);
    setTaken([]);
    setTries(0);
    setTurnIdx(0);
    setScores(Object.fromEntries(playersList.map((pl) => [pl, 0])));
    seenRef.current = new Map();
    setPhase("play");
  }

  function findPair(pid: string) { return pairs.find((p) => p.id === pid); }
  const isFlipped = (c: Card) => revealed.includes(c.id) || taken.includes(c.id);
  const isTaken = (c: Card) => taken.includes(c.id);

  /* 카드 뒤집기 */
  function flip(card: Card): "match" | "miss" | "noop" {
    if (phase !== "play") return "noop";
    if (isFlipped(card)) return "noop";
    if (revealed.length >= 2) return "noop";
    if (revealed.length === 0 && card.type !== "q") return "noop";
    if (revealed.length === 1 && card.type !== "a") return "noop";
    if (missTimerRef.current) return "noop";

    seenRef.current.set(card.id, card.pairId);
    const newRevealed = [...revealed, card.id];
    setRevealed(newRevealed);

    if (newRevealed.length === 2) {
      const nextTries = tries + 1;
      const reachedMaximum = nextTries >= maximumAttempts;
      setTries(nextTries);
      const [qId, aId] = newRevealed;
      const qCard = qCards.find((c) => c.id === qId);
      const aCard = aCards.find((c) => c.id === aId);
      const match = !!(qCard && aCard && qCard.pairId === aCard.pairId);

      if (match) {
        setTimeout(() => {
          const newTaken = [...taken, qId, aId];
          setTaken(newTaken);
          setRevealed([]);
          setScores((s) => ({ ...s, [currentPlayer]: (s[currentPlayer] ?? 0) + 1 }));
          if (
            newTaken.length >= qCards.length + aCards.length ||
            reachedMaximum
          ) {
            setPhase("done");
          }
        }, 500);
        return "match";
      } else {
        // miss: 잠시 후 복원 + 차례 넘김 (멀티/AI 모드만)
        missTimerRef.current = setTimeout(() => {
          setRevealed([]);
          missTimerRef.current = null;
          if (reachedMaximum) {
            setPhase("done");
          } else if (hasOpponents) {
            setTurnIdx((t) => (t + 1) % playersList.length);
          }
        }, MISS_DELAY);
        return "miss";
      }
    }
    return "noop";
  }

  function userFlip(card: Card) {
    if (!isHumanTurn) return;
    flip(card);
  }

  /* AI 차례: 단계별로 카드 선택 (revealed 상태 변화에 따라 재실행) */
  useEffect(() => {
    if (!isAITurn || phase !== "play") return;
    if (missTimerRef.current) return;

    const seen = seenRef.current;
    const availableQ = qCards.filter((c) => !taken.includes(c.id));
    const availableA = aCards.filter((c) => !taken.includes(c.id));

    // 1단계: 질문 카드 선택 (revealed가 비어 있을 때)
    if (revealed.length === 0) {
      if (availableQ.length === 0) return;
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
      aiTimerRef.current = setTimeout(() => {
        // 본 적 있는 카드들 중 짝이 맞는 페어가 있으면 그 질문 우선
        const seenQs = availableQ.filter((c) => seen.has(c.id));
        const seenAs = availableA.filter((c) => seen.has(c.id));
        let pickedQ: Card | undefined;
        for (const q of seenQs) {
          if (seenAs.some((a) => a.pairId === q.pairId)) { pickedQ = q; break; }
        }
        if (!pickedQ) {
          // 본 적 없는 질문 카드 우선 (탐색)
          const unseenQ = availableQ.filter((c) => !seen.has(c.id));
          pickedQ = unseenQ.length > 0
            ? unseenQ[Math.floor(Math.random() * unseenQ.length)]
            : availableQ[Math.floor(Math.random() * availableQ.length)];
        }
        flip(pickedQ);
      }, AI_THINK_MS);
    }

    // 2단계: 대답 카드 선택 (revealed에 질문이 들어있을 때)
    if (revealed.length === 1) {
      const revealedQId = revealed[0];
      const revealedQ = qCards.find((c) => c.id === revealedQId);
      if (!revealedQ || availableA.length === 0) return;
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
      aiTimerRef.current = setTimeout(() => {
        // 짝이 맞는 대답 카드를 본 적이 있으면 그것 선택 (똑똑한 매칭)
        let pickedA: Card | undefined =
          availableA.find((c) => c.pairId === revealedQ.pairId && seen.has(c.id));
        if (!pickedA) {
          // 본 적 없는 대답 카드 우선 (탐색)
          const unseenA = availableA.filter((c) => !seen.has(c.id));
          pickedA = unseenA.length > 0
            ? unseenA[Math.floor(Math.random() * unseenA.length)]
            : availableA[Math.floor(Math.random() * availableA.length)];
        }
        flip(pickedA);
      }, AI_THINK_MS);
    }

    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAITurn, phase, revealed, taken.length, qCards, aCards]);

  /* 결과 */
  if (phase === "done") {
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topScore = sorted[0]?.[1] ?? 0;
    const winners = sorted.filter(([, s]) => s === topScore && topScore > 0);
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <GameHeader game={game} subtitle={locale === "en" ? "Complete!" : "완성!"} onBack={onBack} />
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 text-card-foreground shadow-sm">
          <div className="text-6xl">🏆</div>
          <h2 className="text-2xl font-black text-foreground">{text.memoryDone}</h2>
          {hasOpponents && winners.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">{winners.length === 1 ? text.winner : text.jointWinner}</p>
              <div className="flex flex-wrap gap-2">
                {winners.map(([name]) => (
                  <span key={name} className="px-3 py-1 rounded-full text-white text-sm font-black"
                    style={{ background: game.gradientCss }}>
                    👑 {name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{getMemoryDifficultyLabel(locale, difficulty)} · {text.attempts(tries)}</p>
          )}
        </div>

        {/* 점수판 */}
        {hasOpponents && (
          <div className="space-y-2 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
            <h3 className="mb-1 text-sm font-black text-foreground">{text.scoreboard}</h3>
            {sorted.map(([name, score], i) => (
              <div key={name} className="flex items-center gap-3 rounded-lg bg-muted p-3">
                <span className="text-lg w-6 text-center">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}`}</span>
                <span className="flex-1 font-bold text-foreground">{name}</span>
                <span className="font-black text-violet-700 dark:text-violet-300">
                  {score}{locale === "en" ? ` ${text.pair}` : text.pair}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 질문-대답 짝 정리 */}
        <GameResultReview
          title={text.memoryPairsTitle}
          accentColor={game.accentColor}
          entries={pairs.map((p) => ({ q: p.question, a: p.answer }))}
          qPrefix="💧"
          aPrefix="⭐"
        />

        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          onClick={() => setPhase("setup")}>
          {text.retry}
        </Button>
      </div>
    );
  }

  /* 난이도 선택 */
  if (phase === "setup") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <GameHeader game={game} subtitle={
          isSolo ? text.soloModeSubtitle
          : isAI ? text.aiModeSubtitle
          : text.friendModeSubtitle(playersList.length)
        } onBack={onBack} />
        <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="font-black text-foreground">{text.memoryChooseDifficulty}</h2>
          {hasOpponents && (
            <div className="flex flex-wrap gap-2">
              {playersList.map((p, i) => (
                <span key={p} className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-foreground">
                  {i + 1}. {p}
                </span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MEMORY_DIFFICULTY) as MemoryDifficulty[]).map((d) => {
              const cfg = MEMORY_DIFFICULTY[d];
              return (
                <button key={d} onClick={() => startGame(d)}
                  className="rounded-lg border-2 border-border bg-background p-4 text-foreground transition-colors hover:border-violet-500">
                  <p className="text-sm font-black">{getMemoryDifficultyLabel(locale, d)}</p>
                  <p className="mt-1 text-2xl font-black text-violet-700 dark:text-violet-300">
                    {cfg.cards}{locale === "en" ? ` ${text.card}` : text.card}
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">{cfg.pairs}{locale === "en" ? ` ${text.pair}` : text.pair}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* 생성 중 */
  if (phase === "generating") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <GameHeader game={game} subtitle={text.memoryGeneratingCards} onBack={onBack} />
        <div className="rounded-lg border border-border bg-card p-10 text-center text-card-foreground shadow-sm">
          <div className="text-6xl animate-bounce mb-3">🃏</div>
          <p className="text-sm font-bold text-muted-foreground">
            {aiLoading ? text.memoryAiGenerating : text.preparing}
          </p>
        </div>
      </div>
    );
  }

  /* 게임 진행 */
  const cfg = MEMORY_DIFFICULTY[difficulty];
  const remaining = qCards.length + aCards.length - taken.length;
  const cols = cfg.pairs <= 6 ? 3 : 5;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <GameHeader game={game}
        subtitle={hasOpponents
          ? `${text.turnOf(currentPlayer)} · ${text.remainingCards(remaining)} · ${locale === "en" ? `Attempts ${tries}/${maximumAttempts}` : `시도 ${tries}/${maximumAttempts}`}`
          : `${text.remainingCards(remaining)} · ${locale === "en" ? `Attempts ${tries}/${maximumAttempts}` : `시도 ${tries}/${maximumAttempts}`}`}
        onBack={onBack} />

      {/* 점수판 (멀티/AI 모드) */}
      {hasOpponents && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {playersList.map((p, i) => {
            const isCurrent = i === turnIdx % playersList.length;
            return (
              <div key={p}
                className={`flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs ${
                  isCurrent
                    ? "bg-violet-700 text-white dark:bg-violet-300 dark:text-violet-950"
                    : "bg-muted text-foreground"
                }`}>
                <span className="font-bold">{p}</span>
                <span className="font-black">{scores[p] ?? 0}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* AI 생각 중 */}
      {isAITurn && revealed.length === 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-center dark:border-indigo-800 dark:bg-indigo-950">
          <div className="flex items-center justify-center gap-2 text-indigo-700 dark:text-indigo-200">
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold">{text.aiChoosingCard}</p>
          </div>
        </div>
      )}

      {/* 질문 카드 */}
      <div className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm">
        <p className="mb-2 text-xs font-black text-blue-700 dark:text-blue-300">{text.questionCard}</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {qCards.map((c) => {
            const flipped = isFlipped(c);
            const tk = isTaken(c);
            const pair = findPair(c.pairId);
            return (
              <button key={c.id} onClick={() => !flipped && userFlip(c)}
                disabled={flipped || revealed.length >= 2 || !isHumanTurn}
                className={`flex aspect-[3/4] items-center justify-center overflow-y-auto rounded-lg border-2 p-2 text-center transition-colors ${
                  tk
                    ? "border-blue-300 bg-blue-100 text-blue-950 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100"
                    : flipped
                      ? "border-blue-500 bg-blue-50 text-blue-950 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-50"
                      : "border-blue-900 bg-blue-700 text-white dark:border-blue-300 dark:bg-blue-600"
                } ${!isHumanTurn || flipped ? "cursor-default" : "cursor-pointer"}`}>
                {flipped ? (
                  <AutoFitText text={pair?.question ?? "?"} />
                ) : (
                  <span className="text-3xl">❓</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 대답 카드 */}
      <div className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm">
        <p className="mb-2 text-xs font-black text-amber-700 dark:text-amber-300">{text.answerCard}</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {aCards.map((c) => {
            const flipped = isFlipped(c);
            const tk = isTaken(c);
            const pair = findPair(c.pairId);
            return (
              <button key={c.id} onClick={() => !flipped && userFlip(c)}
                disabled={flipped || revealed.length !== 1 || !isHumanTurn}
                className={`flex aspect-[3/4] items-center justify-center overflow-y-auto rounded-lg border-2 p-2 text-center transition-colors ${
                  tk
                    ? "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                    : flipped
                      ? "border-amber-500 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-50"
                      : "border-amber-700 bg-amber-400 text-slate-950 dark:border-amber-300 dark:bg-amber-300 dark:text-slate-950"
                } ${!isHumanTurn || flipped ? "cursor-default" : "cursor-pointer"}`}>
                {flipped ? (
                  <AutoFitText text={pair?.answer ?? "!"} />
                ) : (
                  <span className="text-3xl">❗</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-center text-xs font-semibold text-muted-foreground">
        {isHumanTurn && revealed.length === 0 && text.pickQuestionCard}
        {isHumanTurn && revealed.length === 1 && text.pickAnswerCard}
        {isHumanTurn && revealed.length === 2 && text.checkingPair}
        {isAITurn && revealed.length > 0 && text.aiFlippingCard}
      </p>
    </div>
  );
}

/**
 * 카드 안에 글씨를 최대한 크게 채우되, 카드 밖으로 넘치지 않도록 폰트 크기를 자동 조절한다.
 * 부모(카드)의 안쪽 크기에 맞을 때까지 글씨 크기를 줄인다.
 */
function AutoFitText({ text, max = 20, min = 9 }: { text: string; max?: number; min?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      const parent = el?.parentElement;
      if (!el || !parent) return;
      const cs = getComputedStyle(parent);
      const maxW = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const maxH = parent.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      let size = max;
      el.style.fontSize = `${size}px`;
      while (size > min && (el.scrollHeight > maxH || el.scrollWidth > maxW)) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [text, max, min]);

  return (
    <span ref={ref} className="block w-full font-semibold break-keep" style={{ lineHeight: 1.15 }}>
      {text}
    </span>
  );
}
