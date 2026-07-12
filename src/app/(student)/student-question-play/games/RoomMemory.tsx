"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RoomHeader, WaitingBanner, playerColorById } from "./roomShared";
import RoomResult from "./RoomResult";
import { useAIPlay } from "./useAIPlay";
import {
  MEMORY_DIFFICULTY, MemoryDifficulty, QAPair,
  pickFallbackPairs, parseAIPairs, resolveMemoryRollRoundId, shuffle,
} from "@/lib/memory-game-data";
import type { BuiltInGame, GameRoom, RoomActionHandler } from "@/lib/question-games-data";

interface MemoryCard {
  id: string;
  pairId: string;
  type: "q" | "a"; // 질문 or 대답
}

interface MemoryState {
  phase: "setup" | "generating" | "rolling" | "play" | "done";
  difficulty: MemoryDifficulty;
  pairs: QAPair[];           // 모든 학생이 같은 페어
  qCards: MemoryCard[];      // 셔플된 질문 카드 (위치 = 인덱스)
  aCards: MemoryCard[];      // 셔플된 대답 카드
  diceRolls: Record<string, number>; // 학생별 주사위
  rollRoundId?: string;
  turnOrder: string[];       // 순서 결정 후 학생 id 배열
  currentTurnIdx: number;
  takenIds: string[];        // 획득된 카드 id (qCards/aCards 양쪽)
  revealedIds: string[];     // 현재 차례에 뒤집힌 카드 id (최대 2)
  scores: Record<string, number>; // 학생별 모은 쌍 수
  lastReveal?: { result: "match" | "miss"; at: number; turnPlayerId: string };
}

interface Props {
  game: BuiltInGame; room: GameRoom; myId: string; actionLoading: boolean;
  onAction: RoomActionHandler;
  onLeave: () => void;
}

const MISS_DELAY = 2500; // 짝이 안 맞을 때 다시 뒤집기까지 대기 (ms)

export default function RoomMemory({ game, room, myId, actionLoading, onAction, onLeave }: Props) {
  const isHost = room.hostId === myId;
  const state = room.gameState as unknown as MemoryState;
  const hasState = state && typeof state.phase === "string";
  const { ask, loading: aiLoading } = useAIPlay();

  const initRef = useRef(false);
  const missTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiGenRef = useRef(false);
  const mountedRef = useRef(false);
  const roomIdentityRef = useRef({ code: room.code, createdAt: room.createdAt });
  // 효과 전 요청에도 최신 렌더의 방 정체성을 사용해야 한다.
  // eslint-disable-next-line react-hooks/refs
  roomIdentityRef.current = { code: room.code, createdAt: room.createdAt };

  const [diceLocal, setDiceLocal] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (diceIntervalRef.current !== null) {
        clearInterval(diceIntervalRef.current);
        diceIntervalRef.current = null;
      }
    };
  }, []);

  /* ── 방장 초기화: 처음 진입 시 setup phase 진입 ── */
  useEffect(() => {
    if (!isHost || hasState || initRef.current || room.status !== "playing") return;
    initRef.current = true;
    onAction("set-state", { state: {
      phase: "setup",
      difficulty: "normal",
      pairs: [],
      qCards: [], aCards: [],
      diceRolls: {}, turnOrder: [],
      currentTurnIdx: 0, takenIds: [], revealedIds: [],
      scores: {},
    } });
  }, [isHost, hasState, room.status, onAction]);

  /* ── 방장: 난이도 선택 후 AI 페어 생성 ── */
  async function startGame(difficulty: MemoryDifficulty) {
    if (aiGenRef.current) return;
    const startedRoomIdentity = { code: room.code, createdAt: room.createdAt };
    aiGenRef.current = true;
    try {
      const generating = await onAction("update-state", {
        patch: { phase: "generating", difficulty },
      });
      if (!generating.ok) return;

      const cfg = MEMORY_DIFFICULTY[difficulty];
      const response = await ask({
        action: "memory:pairs",
        context: { count: String(cfg.pairs) },
      });
      const pairs = response?.text
        ? parseAIPairs(response.text, cfg.pairs) ?? pickFallbackPairs(cfg.pairs)
        : pickFallbackPairs(cfg.pairs);

      // 질문/대답 카드 생성 + 셔플
      const qCards: MemoryCard[] = pairs.map((p, i) => ({ id: `q-${i}`, pairId: p.id, type: "q" }));
      const aCards: MemoryCard[] = pairs.map((p, i) => ({ id: `a-${i}`, pairId: p.id, type: "a" }));

      const currentRoomIdentity = roomIdentityRef.current;
      if (
        !mountedRef.current ||
        currentRoomIdentity.code !== startedRoomIdentity.code ||
        currentRoomIdentity.createdAt !== startedRoomIdentity.createdAt
      ) return;

      await onAction("update-state", {
        patch: {
          phase: "rolling",
          rollRoundId: crypto.randomUUID(),
          pairs,
          qCards: shuffle(qCards),
          aCards: shuffle(aCards),
          diceRolls: {}, turnOrder: [],
          currentTurnIdx: 0, takenIds: [], revealedIds: [],
          scores: Object.fromEntries(
            generating.room.players.map((p) => [p.id, 0]),
          ),
        },
      }, { expectedRoom: startedRoomIdentity });
    } finally {
      aiGenRef.current = false;
    }
  }

  /* ── 학생: 주사위 굴림 ── */
  async function persistRoll(final: number) {
    const roundId = resolveMemoryRollRoundId(room, state.rollRoundId);
    if (!roundId) {
      setRolling(false);
      setDiceLocal(null);
      return;
    }

    const result = await onAction("memory-roll", {
      roll: final,
      rollRoundId: roundId,
    });
    if (!mountedRef.current) return;
    setRolling(false);
    if (!result.ok) setDiceLocal(null);
  }

  async function rollDice() {
    if (rolling || diceLocal != null) return;
    setRolling(true);
    // 1초 애니메이션
    let count = 0;
    diceIntervalRef.current = setInterval(() => {
      setDiceLocal(Math.floor(Math.random() * 6) + 1);
      count++;
      if (count >= 12) {
        if (diceIntervalRef.current !== null) {
          clearInterval(diceIntervalRef.current);
          diceIntervalRef.current = null;
        }
        const final = Math.floor(Math.random() * 6) + 1;
        setDiceLocal(final);
        void persistRoll(final);
      }
    }, 80);
  }

  /* ── 카드 뒤집기 ── */
  async function flipCard(card: MemoryCard) {
    if (!state) return;
    if (state.phase !== "play") return;
    const currentPlayerId = state.turnOrder[state.currentTurnIdx];
    if (currentPlayerId !== myId) return;
    if (state.takenIds.includes(card.id)) return;
    if (state.revealedIds.includes(card.id)) return;
    if (state.lastReveal?.result === "miss") return; // 미스 대기 중

    const revealed = state.revealedIds;
    // 첫 카드는 질문, 두 번째 카드는 대답 (순서 강제)
    if (revealed.length === 0 && card.type !== "q") return;
    if (revealed.length === 1 && card.type !== "a") return;
    if (revealed.length >= 2) return;

    const newRevealed = [...revealed, card.id];

    if (newRevealed.length === 2) {
      // 짝 매칭 판정
      const [qId, aId] = newRevealed;
      const qCard = state.qCards.find((c) => c.id === qId);
      const aCard = state.aCards.find((c) => c.id === aId);
      const match = qCard && aCard && qCard.pairId === aCard.pairId;
      if (match) {
        // 즉시 획득 + 점수 + 한 번 더 기회 (currentTurnIdx 유지)
        const newScores = { ...state.scores, [myId]: (state.scores[myId] ?? 0) + 1 };
        const newTakenIds = [...state.takenIds, qId, aId];
        const totalCards = state.qCards.length + state.aCards.length;
        const isDone = newTakenIds.length >= totalCards;
        await onAction("update-state", {
          patch: {
            revealedIds: [],
            takenIds: newTakenIds,
            scores: newScores,
            lastReveal: { result: "match", at: Date.now(), turnPlayerId: myId },
            ...(isDone ? { phase: "done" } : {}),
          },
          ...(isDone ? { status: "ended" } : {}),
        });
      } else {
        // miss: 두 카드 공개 상태로 두고 일정 시간 뒤 자동 복원 + 다음 차례
        await onAction("update-state", {
          patch: {
            revealedIds: newRevealed,
            lastReveal: { result: "miss", at: Date.now(), turnPlayerId: myId },
          },
        });
      }
    } else {
      await onAction("update-state", { patch: { revealedIds: newRevealed } });
    }
  }

  /* ── miss 후 자동 복원 (차례의 사람만 처리) ── */
  useEffect(() => {
    if (!hasState || state.phase !== "play") return;
    if (state.lastReveal?.result !== "miss") return;
    const turnPlayerId = state.turnOrder[state.currentTurnIdx];
    if (turnPlayerId !== myId) return;

    if (missTimerRef.current) clearTimeout(missTimerRef.current);
    missTimerRef.current = setTimeout(() => {
      onAction("update-state", {
        patch: {
          revealedIds: [],
          currentTurnIdx: (state.currentTurnIdx + 1) % state.turnOrder.length,
          lastReveal: undefined,
        },
      });
    }, MISS_DELAY);
    return () => { if (missTimerRef.current) clearTimeout(missTimerRef.current); };
  }, [hasState, state?.phase, state?.lastReveal, state?.currentTurnIdx, state?.turnOrder, myId, onAction]);

  /* ── 결과 화면 ── */
  if (room.status === "ended" || state?.phase === "done") {
    const scores = room.players.map((p) => ({
      playerId: p.id, name: p.name,
      score: state?.scores?.[p.id] ?? 0,
    }));
    return (
      <RoomResult game={game} room={room} myId={myId}
        scoreLabel="모은 짝" scoreUnit="쌍"
        scores={scores} questions={[]}
        onAction={onAction} onLeave={onLeave} />
    );
  }

  /* ── 준비 중 / 단계별 UI ── */
  if (!hasState) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <RoomHeader game={game} room={room} subtitle="준비 중..." onLeave={onLeave} />
        <WaitingBanner text="준비 중..." />
      </div>
    );
  }

  // 1) 난이도 선택
  if (state.phase === "setup") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <RoomHeader game={game} room={room} subtitle="난이도 선택" onLeave={onLeave} />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
          <h2 className="font-black text-gray-800">🎚️ 난이도 선택</h2>
          {isHost ? (
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(MEMORY_DIFFICULTY) as MemoryDifficulty[]).map((d) => {
                const cfg = MEMORY_DIFFICULTY[d];
                return (
                  <button key={d} onClick={() => startGame(d)}
                    disabled={aiLoading || actionLoading}
                    className="rounded-2xl border-2 p-4 transition-all hover:scale-105"
                    style={{
                      borderColor: "#e5e7eb",
                      background: "hsl(var(--card))",
                    }}>
                    <p className="font-black text-gray-800 text-sm">{cfg.label}</p>
                    <p className="text-2xl font-black mt-1" style={{ color: game.accentColor }}>{cfg.cards}장</p>
                    <p className="text-xs text-gray-400">{cfg.pairs}쌍</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <WaitingBanner text="방장이 난이도를 정하는 중..." />
          )}
        </div>
      </div>
    );
  }

  // 2) AI 카드 생성 중
  if (state.phase === "generating") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <RoomHeader game={game} room={room} subtitle="카드 만드는 중" onLeave={onLeave} />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <div className="text-6xl animate-bounce mb-3">🃏</div>
          <p className="text-gray-600 font-bold text-sm">
            AI가 질문과 대답 짝을 만드는 중...
          </p>
        </div>
      </div>
    );
  }

  // 3) 주사위로 순서 결정
  if (state.phase === "rolling") {
    const rolledIds = Object.keys(state.diceRolls ?? {});
    const myRoll = state.diceRolls?.[myId];
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <RoomHeader game={game} room={room} subtitle="순서 정하기 (주사위)" onLeave={onLeave} />

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4 text-center">
          <p className="text-sm font-bold text-gray-700">🎲 주사위를 굴려 순서를 정해요!</p>
          <p className="text-xs text-gray-500">큰 숫자가 나온 친구부터 카드 뒤집기 시작!</p>

          {myRoll != null ? (
            <div className="rounded-2xl border-2 border-indigo-200 p-6 space-y-2">
              <p className="text-xs text-gray-400">내 주사위</p>
              <p className="text-6xl font-black" style={{ color: game.accentColor }}>{myRoll}</p>
            </div>
          ) : (
            <Button className="w-full py-5 text-xl font-black text-white rounded-2xl"
              style={{ background: "linear-gradient(135deg, #8B5CF6, #7C3AED)" }}
              disabled={rolling || actionLoading} onClick={rollDice}>
              {rolling ? `🎲 ${diceLocal ?? "?"}` : "🎲 주사위 굴리기"}
            </Button>
          )}

          {/* 참가자별 주사위 결과 */}
          <div className="space-y-1 text-left">
            <p className="text-xs font-bold text-gray-500 mb-2">참가자 ({rolledIds.length}/{room.players.length})</p>
            {room.players.map((p) => {
              const v = state.diceRolls?.[p.id];
              return (
                <div key={p.id} className="flex items-center gap-2 text-sm py-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: playerColorById(room, p.id) }}>
                    {p.name.charAt(0)}
                  </div>
                  <span className="flex-1 text-gray-700">{p.name}{p.id === myId && " (나)"}</span>
                  <span className="font-black text-lg" style={{ color: v != null ? game.accentColor : "#d1d5db" }}>
                    {v ?? "?"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 4) 게임 진행
  const turnPlayerId = state.turnOrder[state.currentTurnIdx];
  const turnPlayer = room.players.find((p) => p.id === turnPlayerId);
  const isMyTurn = turnPlayerId === myId;
  const totalCards = state.qCards.length + state.aCards.length;
  const remaining = totalCards - state.takenIds.length;
  const lastIsMiss = state.lastReveal?.result === "miss";
  const lastIsMatch = state.lastReveal?.result === "match";

  // 카드 라벨/내용 결정 (뒤집힘 = revealed or taken)
  const isFlipped = (card: MemoryCard) =>
    state.revealedIds.includes(card.id) || state.takenIds.includes(card.id);
  const isTaken = (card: MemoryCard) => state.takenIds.includes(card.id);
  const findPair = (pid: string) => state.pairs.find((p) => p.id === pid);

  const cfg = MEMORY_DIFFICULTY[state.difficulty];
  const cols = cfg.pairs <= 6 ? 3 : cfg.pairs <= 10 ? 5 : 5; // 그리드 컬럼 수

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <RoomHeader game={game} room={room}
        subtitle={`남은 카드 ${remaining}장 · ${cfg.label}`}
        onLeave={onLeave} />

      {/* 차례 표시 + 점수 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-700">
            {isMyTurn ? "🙋 내 차례!" : `⏳ ${turnPlayer?.name}의 차례`}
            {lastIsMatch && <span className="ml-2 text-green-600 text-xs">✨ 짝 성공! 한 번 더!</span>}
            {lastIsMiss && <span className="ml-2 text-orange-600 text-xs">아쉬워요... 다음 차례로</span>}
          </p>
        </div>
        {/* 스코어 미니바 */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {room.players.map((p) => {
            const score = state.scores?.[p.id] ?? 0;
            const isCurrent = p.id === turnPlayerId;
            return (
              <div key={p.id} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs flex-shrink-0"
                style={{
                  background: isCurrent ? playerColorById(room, p.id) : `${playerColorById(room, p.id)}20`,
                  color: isCurrent ? "white" : playerColorById(room, p.id),
                }}>
                <span className="font-bold">{p.name}</span>
                <span className="font-black">{score}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 질문 카드 (파란색) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <p className="text-xs font-black text-blue-600 mb-2">💧 질문 카드 (파란색)</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {state.qCards.map((c) => {
            const flipped = isFlipped(c);
            const taken = isTaken(c);
            const pair = findPair(c.pairId);
            return (
              <button key={c.id}
                onClick={() => !flipped && flipCard(c)}
                disabled={!isMyTurn || flipped || state.revealedIds.length >= 2 || lastIsMiss}
                className="aspect-[3/4] rounded-xl border-2 flex items-center justify-center text-xs text-center p-1.5 transition-all"
                style={{
                  background: taken ? "#dbeafe33" : flipped ? "#dbeafe" : "linear-gradient(135deg, #3b82f6, #2563eb)",
                  borderColor: taken ? "transparent" : flipped ? "#3b82f6" : "#1e40af",
                  color: flipped ? "#1e3a8a" : "white",
                  opacity: taken ? 0.3 : 1,
                  cursor: !isMyTurn || flipped ? "default" : "pointer",
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

      {/* 대답 카드 (노란색) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <p className="text-xs font-black text-amber-600 mb-2">⭐ 대답 카드 (노란색)</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {state.aCards.map((c) => {
            const flipped = isFlipped(c);
            const taken = isTaken(c);
            const pair = findPair(c.pairId);
            return (
              <button key={c.id}
                onClick={() => !flipped && flipCard(c)}
                disabled={
                  !isMyTurn || flipped ||
                  state.revealedIds.length !== 1 ||
                  lastIsMiss
                }
                className="aspect-[3/4] rounded-xl border-2 flex items-center justify-center text-xs text-center p-1.5 transition-all"
                style={{
                  background: taken ? "#fef3c733" : flipped ? "#fef3c7" : "linear-gradient(135deg, #f59e0b, #d97706)",
                  borderColor: taken ? "transparent" : flipped ? "#f59e0b" : "#92400e",
                  color: flipped ? "#78350f" : "white",
                  opacity: taken ? 0.3 : 1,
                  cursor: !isMyTurn || flipped ? "default" : "pointer",
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

      {/* 안내 */}
      {isMyTurn && (
        <p className="text-xs text-center text-gray-500">
          {state.revealedIds.length === 0 && "💧 파란색(질문) 카드 1장을 골라요"}
          {state.revealedIds.length === 1 && "⭐ 노란색(대답) 카드 1장을 골라 짝을 맞춰요"}
          {state.revealedIds.length === 2 && lastIsMiss && "❌ 짝이 아니에요. 잠시 후 다시 뒤집혀요..."}
        </p>
      )}

      {/* 방장 종료 */}
      {isHost && (
        <Button variant="outline" className="w-full rounded-xl text-gray-500"
          onClick={() => onAction("update-state", { patch: { phase: "done" }, status: "ended" })}>
          🏁 게임 마치기
        </Button>
      )}
    </div>
  );
}
