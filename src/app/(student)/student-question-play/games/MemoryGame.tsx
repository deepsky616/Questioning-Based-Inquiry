"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
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

export default function MemoryGame({ game, onBack, config }: Props) {
  const [phase, setPhase] = useState<"setup" | "generating" | "play" | "done">("setup");
  const [difficulty, setDifficulty] = useState<MemoryDifficulty>("normal");
  const [pairs, setPairs] = useState<QAPair[]>([]);
  const [qCards, setQCards] = useState<Card[]>([]);
  const [aCards, setACards] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [taken, setTaken] = useState<string[]>([]);
  const [tries, setTries] = useState(0);
  const [matches, setMatches] = useState(0);

  const { ask, loading: aiLoading } = useAIPlay();
  const missTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setMatches(0);
    setPhase("play");
  }

  function findPair(pid: string) { return pairs.find((p) => p.id === pid); }
  const isFlipped = (c: Card) => revealed.includes(c.id) || taken.includes(c.id);
  const isTaken = (c: Card) => taken.includes(c.id);

  function flip(card: Card) {
    if (phase !== "play") return;
    if (isFlipped(card)) return;
    if (revealed.length >= 2) return;
    if (revealed.length === 0 && card.type !== "q") return;
    if (revealed.length === 1 && card.type !== "a") return;
    if (missTimerRef.current) return;

    const newRevealed = [...revealed, card.id];
    setRevealed(newRevealed);

    if (newRevealed.length === 2) {
      setTries((t) => t + 1);
      const [qId, aId] = newRevealed;
      const qCard = qCards.find((c) => c.id === qId);
      const aCard = aCards.find((c) => c.id === aId);
      if (qCard && aCard && qCard.pairId === aCard.pairId) {
        // 즉시 획득
        setTimeout(() => {
          const newTaken = [...taken, qId, aId];
          setTaken(newTaken);
          setRevealed([]);
          setMatches((m) => m + 1);
          if (newTaken.length >= qCards.length + aCards.length) {
            setPhase("done");
          }
        }, 400);
      } else {
        // miss
        missTimerRef.current = setTimeout(() => {
          setRevealed([]);
          missTimerRef.current = null;
        }, MISS_DELAY);
      }
    }
  }

  /* ── 결과 ── */
  if (phase === "done") {
    const cfg = MEMORY_DIFFICULTY[difficulty];
    const accuracy = tries === 0 ? 0 : Math.round((matches / tries) * 100);
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <Header game={game} subtitle="완성!" onBack={onBack} />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex flex-col items-center gap-3">
          <div className="text-6xl">🏆</div>
          <h2 className="text-2xl font-black text-gray-800">짝 찾기 완성!</h2>
          <p className="text-gray-500 text-sm">
            {cfg.label} · {matches}쌍 / {cfg.pairs}쌍
          </p>
          <p className="text-gray-400 text-xs">
            시도 {tries}번 · 정확도 {accuracy}%
          </p>
        </div>
        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          onClick={() => setPhase("setup")}>
          🔄 다시 하기
        </Button>
      </div>
    );
  }

  /* ── 난이도 선택 ── */
  if (phase === "setup") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <Header game={game} subtitle="난이도 선택" onBack={onBack} />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-black text-gray-800">🎚️ 난이도를 골라요</h2>
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

  /* ── AI 생성 중 ── */
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

  /* ── 게임 진행 ── */
  const cfg = MEMORY_DIFFICULTY[difficulty];
  const remaining = qCards.length + aCards.length - taken.length;
  const cols = cfg.pairs <= 6 ? 3 : 5;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Header game={game} subtitle={`남은 카드 ${remaining}장 · 시도 ${tries}번 · 맞춤 ${matches}쌍`} onBack={onBack} />

      {/* 질문 카드 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <p className="text-xs font-black text-blue-600 mb-2">💧 질문 카드 (파란색)</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {qCards.map((c) => {
            const flipped = isFlipped(c);
            const tk = isTaken(c);
            const pair = findPair(c.pairId);
            return (
              <button key={c.id} onClick={() => !flipped && flip(c)}
                disabled={flipped || revealed.length >= 2}
                className="aspect-[3/4] rounded-xl border-2 flex items-center justify-center text-xs text-center p-1.5 transition-all"
                style={{
                  background: tk ? "#dbeafe33" : flipped ? "#dbeafe" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                  borderColor: tk ? "transparent" : flipped ? "#3b82f6" : "#1e40af",
                  color: flipped ? "#1e3a8a" : "white",
                  opacity: tk ? 0.3 : 1,
                }}>
                {flipped ? (
                  <span className="text-[10px] leading-tight">{pair?.question ?? "?"}</span>
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
              <button key={c.id} onClick={() => !flipped && flip(c)}
                disabled={flipped || revealed.length !== 1}
                className="aspect-[3/4] rounded-xl border-2 flex items-center justify-center text-xs text-center p-1.5 transition-all"
                style={{
                  background: tk ? "#fef3c733" : flipped ? "#fef3c7" : "linear-gradient(135deg, #f59e0b, #d97706)",
                  borderColor: tk ? "transparent" : flipped ? "#f59e0b" : "#92400e",
                  color: flipped ? "#78350f" : "white",
                  opacity: tk ? 0.3 : 1,
                }}>
                {flipped ? (
                  <span className="text-[10px] leading-tight">{pair?.answer ?? "!"}</span>
                ) : (
                  <span className="text-3xl">❗</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-center text-gray-500">
        {revealed.length === 0 && "💧 파란색(질문) 카드 1장을 골라요"}
        {revealed.length === 1 && "⭐ 노란색(대답) 카드 1장을 골라 짝을 맞춰요"}
        {revealed.length === 2 && "✨ 짝 확인 중..."}
      </p>
    </div>
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
