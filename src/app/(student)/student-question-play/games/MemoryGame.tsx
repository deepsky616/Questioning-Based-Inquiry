"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import { useSingleAward, AwardBadge } from "./useSingleAward";
import {
  MEMORY_DIFFICULTY, MemoryDifficulty, QAPair,
  pickFallbackPairs, parseAIPairs, shuffle,
} from "@/lib/memory-game-data";
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
  const { mode } = config;
  const isAI = mode === "ai";
  const isSolo = mode === "solo";

  // 참가자 구성
  const playersList = (() => {
    if (isSolo) return [config.players[0]?.trim() || "나"];
    if (isAI) return [config.players[0]?.trim() || "나", AI_NAME];
    return config.players.length > 0 ? config.players : ["나"];
  })();
  const hasOpponents = playersList.length > 1;

  const [phase, setPhase] = useState<"setup" | "generating" | "play" | "done">("setup");
  const [difficulty, setDifficulty] = useState<MemoryDifficulty>("normal");
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
  const { award, result: awardResult, reset: resetAward } = useSingleAward();
  const missTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 본인이 모은 쌍 수 (혼자 모드는 전체 matches, AI 모드는 본인 score)
  const myMatches = isSolo
    ? Object.values(scores).reduce((a, b) => a + b, 0)
    : (scores[playersList[0]] ?? 0);

  // 종료 시 1회 적립 (혼자/AI 모드만)
  useEffect(() => {
    if (phase !== "done") return;
    if (mode !== "solo" && mode !== "ai") return;
    award({
      mode: mode as "solo" | "ai",
      gameId: "memory",
      validQuestions: myMatches,
      completed: taken.length >= qCards.length + aCards.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const currentPlayer = playersList[turnIdx % playersList.length] ?? "나";
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
    if (!p) p = pickFallbackPairs(cfg.pairs);

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
      setTries((t) => t + 1);
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
          if (newTaken.length >= qCards.length + aCards.length) setPhase("done");
        }, 500);
        return "match";
      } else {
        // miss: 잠시 후 복원 + 차례 넘김 (멀티/AI 모드만)
        missTimerRef.current = setTimeout(() => {
          setRevealed([]);
          missTimerRef.current = null;
          if (hasOpponents) setTurnIdx((t) => (t + 1) % playersList.length);
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
    const cfg = MEMORY_DIFFICULTY[difficulty];
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topScore = sorted[0]?.[1] ?? 0;
    const winners = sorted.filter(([, s]) => s === topScore && topScore > 0);
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <Header game={game} subtitle="완성!" onBack={onBack} />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex flex-col items-center gap-3">
          <div className="text-6xl">🏆</div>
          <h2 className="text-2xl font-black text-gray-800">짝 찾기 완성!</h2>
          {hasOpponents && winners.length > 0 ? (
            <>
              <p className="text-gray-500 text-sm">{winners.length === 1 ? "우승" : "공동 우승"}</p>
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
            <p className="text-gray-500 text-sm">{cfg.label} · {tries}번 시도</p>
          )}
        </div>

        {/* 점수판 */}
        {hasOpponents && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
            <h3 className="font-black text-gray-700 text-sm mb-1">📊 점수판</h3>
            {sorted.map(([name, score], i) => (
              <div key={name} className="flex items-center gap-3 rounded-xl p-3 bg-gray-50">
                <span className="text-lg w-6 text-center">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}`}</span>
                <span className="font-bold text-gray-800 flex-1">{name}</span>
                <span className="font-black" style={{ color: game.accentColor }}>{score}쌍</span>
              </div>
            ))}
          </div>
        )}

        {/* 적립 결과 */}
        <AwardBadge result={awardResult} />

        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          onClick={() => { resetAward(); setPhase("setup"); }}>
          🔄 다시 하기
        </Button>
      </div>
    );
  }

  /* 난이도 선택 */
  if (phase === "setup") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <Header game={game} subtitle={
          isSolo ? "혼자 모드 — 자유롭게 진행"
          : isAI ? "AI와 함께 — 점수 경쟁"
          : `친구 모드 — ${playersList.length}명 차례 진행`
        } onBack={onBack} />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-black text-gray-800">🎚️ 난이도를 골라요</h2>
          {hasOpponents && (
            <div className="flex flex-wrap gap-2">
              {playersList.map((p, i) => (
                <span key={p} className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
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
                  className="rounded-2xl border-2 border-gray-200 p-4 hover:scale-105 transition-all">
                  <p className="font-black text-gray-800 text-sm">{cfg.label}</p>
                  <p className="text-2xl font-black mt-1" style={{ color: game.accentColor }}>{cfg.cards}장</p>
                  <p className="text-xs text-gray-400">{cfg.pairs}쌍</p>
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
        <Header game={game} subtitle="카드 만드는 중" onBack={onBack} />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="text-6xl animate-bounce mb-3">🃏</div>
          <p className="text-gray-600 font-bold text-sm">
            {aiLoading ? "AI가 질문과 대답 짝을 만드는 중..." : "준비하는 중..."}
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
      <Header game={game}
        subtitle={hasOpponents
          ? `${currentPlayer}의 차례 · 남은 카드 ${remaining}장`
          : `남은 카드 ${remaining}장 · 시도 ${tries}번`}
        onBack={onBack} />

      {/* 점수판 (멀티/AI 모드) */}
      {hasOpponents && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {playersList.map((p, i) => {
            const isCurrent = i === turnIdx % playersList.length;
            return (
              <div key={p}
                className="flex items-center gap-1 rounded-full px-3 py-1 text-xs flex-shrink-0"
                style={{
                  background: isCurrent ? game.accentColor : `${game.accentColor}20`,
                  color: isCurrent ? "white" : game.accentColor,
                }}>
                <span className="font-bold">{p}</span>
                <span className="font-black">{scores[p] ?? 0}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* AI 생각 중 */}
      {isAITurn && revealed.length === 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-2 text-indigo-600">
            <span className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold">🤖 AI가 카드를 고르는 중...</p>
          </div>
        </div>
      )}

      {/* 질문 카드 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <p className="text-xs font-black text-blue-600 mb-2">💧 질문 카드 (파란색)</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {qCards.map((c) => {
            const flipped = isFlipped(c);
            const tk = isTaken(c);
            const pair = findPair(c.pairId);
            return (
              <button key={c.id} onClick={() => !flipped && userFlip(c)}
                disabled={flipped || revealed.length >= 2 || !isHumanTurn}
                className="aspect-[3/4] overflow-hidden rounded-xl border-2 flex items-center justify-center text-center p-2 transition-all"
                style={{
                  background: tk ? "#dbeafe33" : flipped ? "#dbeafe" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                  borderColor: tk ? "transparent" : flipped ? "#3b82f6" : "#1e40af",
                  color: flipped ? "#1e3a8a" : "white",
                  opacity: tk ? 0.3 : 1,
                  cursor: !isHumanTurn || flipped ? "default" : "pointer",
                }}>
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
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <p className="text-xs font-black text-amber-600 mb-2">⭐ 대답 카드 (노란색)</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {aCards.map((c) => {
            const flipped = isFlipped(c);
            const tk = isTaken(c);
            const pair = findPair(c.pairId);
            return (
              <button key={c.id} onClick={() => !flipped && userFlip(c)}
                disabled={flipped || revealed.length !== 1 || !isHumanTurn}
                className="aspect-[3/4] overflow-hidden rounded-xl border-2 flex items-center justify-center text-center p-2 transition-all"
                style={{
                  background: tk ? "#fef3c733" : flipped ? "#fef3c7" : "linear-gradient(135deg, #f59e0b, #d97706)",
                  borderColor: tk ? "transparent" : flipped ? "#f59e0b" : "#92400e",
                  color: flipped ? "#78350f" : "white",
                  opacity: tk ? 0.3 : 1,
                  cursor: !isHumanTurn || flipped ? "default" : "pointer",
                }}>
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

      <p className="text-xs text-center text-gray-500">
        {isHumanTurn && revealed.length === 0 && "💧 파란색(질문) 카드 1장을 골라요"}
        {isHumanTurn && revealed.length === 1 && "⭐ 노란색(대답) 카드 1장을 골라 짝을 맞춰요"}
        {isHumanTurn && revealed.length === 2 && "✨ 짝 확인 중..."}
        {isAITurn && revealed.length > 0 && "🤖 AI가 카드를 뒤집고 있어요..."}
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

function Header({ game, subtitle, onBack }: { game: BuiltInGame; subtitle: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
      <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
        style={{ background: game.gradientCss }}>
        <span className="text-4xl">{game.emoji}</span>
        <div>
          <h1 className="text-xl font-black">{game.title}</h1>
          <p className="text-white/80 text-sm">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
