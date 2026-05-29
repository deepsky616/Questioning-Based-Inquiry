"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { RoomHeader, TurnBar, WaitingBanner, playerColorById } from "./roomShared";
import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";

const DICE_TYPES = [
  { face: 1, type: "사실질문", desc: "사실·정보를 확인하는 질문", color: "#3b82f6" },
  { face: 2, type: "개념질문", desc: "의미나 본질을 파악하는 질문", color: "#8b5cf6" },
  { face: 3, type: "논쟁질문", desc: "옳고 그름을 따져보는 질문", color: "#ef4444" },
  { face: 4, type: "상상질문", desc: "상상해보는 질문", color: "#f59e0b" },
  { face: 5, type: "비교질문", desc: "둘을 비교·대조하는 질문", color: "#10b981" },
  { face: 6, type: "열린질문", desc: "자유롭게 탐구하는 질문", color: "#ec4899" },
];
const DOTS: Record<number, [number, number][]> = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
};

interface DiceEntry { face: number; type: string; question: string; playerId: string; playerName: string }
interface DiceState { phase: "rolling" | "writing"; face: number; history: DiceEntry[] }

interface Props {
  game: BuiltInGame; room: GameRoom; myId: string; actionLoading: boolean;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<GameRoom | null>;
  onLeave: () => void;
}

export default function RoomDice({ game, room, myId, actionLoading, onAction, onLeave }: Props) {
  const [input, setInput] = useState("");
  const [displayFace, setDisplayFace] = useState(1);
  const [localRolling, setLocalRolling] = useState(false);
  const initRef = useRef(false);

  const isHost = room.hostId === myId;
  const state = room.gameState as unknown as DiceState;
  const hasState = state && typeof state.phase === "string";
  const currentPlayer = room.players[room.turnIndex % room.players.length];
  const isMyTurn = currentPlayer?.id === myId;

  useEffect(() => {
    if (isHost && !hasState && !initRef.current && room.status === "playing") {
      initRef.current = true;
      onAction("set-state", { state: { phase: "rolling", face: 0, history: [] }, turnIndex: 0 });
    }
  }, [isHost, hasState, room.status, onAction]);

  if (room.status === "ended") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <RoomHeader game={game} room={room} subtitle="게임 종료!" onLeave={onLeave} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-4">
          <div className="text-6xl">🎲</div>
          <h2 className="text-2xl font-black text-gray-800">주사위 놀이 완성!</h2>
          <p className="text-gray-500 text-sm">{state?.history?.length ?? 0}개의 질문을 함께 만들었어요!</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2 max-h-72 overflow-y-auto">
          {(state?.history ?? []).map((h, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-black text-sm"
                style={{ background: DICE_TYPES[h.face - 1]?.color }}>{h.face}</div>
              <div>
                <p className="text-xs" style={{ color: playerColorById(room, h.playerId) }}>{h.playerName} · {h.type}</p>
                <p className="text-gray-800 text-sm">{h.question}</p>
              </div>
            </div>
          ))}
        </div>
        {isHost && (
          <Button className="w-full py-4 font-black text-white rounded-xl" style={{ background: game.gradientCss }}
            onClick={() => onAction("restart")}>🔄 대기실로 돌아가기</Button>
        )}
        {!isHost && <p className="text-center text-gray-400 text-sm">방장이 다음 게임을 준비하고 있어요...</p>}
      </div>
    );
  }

  if (!hasState) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <RoomHeader game={game} room={room} subtitle="준비 중..." onLeave={onLeave} />
        <WaitingBanner text="게임을 준비하는 중..." />
      </div>
    );
  }

  function roll() {
    if (localRolling || actionLoading) return;
    setLocalRolling(true);
    let count = 0;
    const final = Math.ceil(Math.random() * 6);
    const iv = setInterval(() => {
      setDisplayFace(Math.ceil(Math.random() * 6));
      count++;
      if (count >= 12) {
        clearInterval(iv);
        setDisplayFace(final);
        setLocalRolling(false);
        onAction("update-state", { patch: { phase: "writing", face: final } });
      }
    }, 100);
  }

  async function submit() {
    const trimmed = input.trim();
    if (!trimmed || actionLoading) return;
    const typeInfo = DICE_TYPES[state.face - 1];
    const entry: DiceEntry = {
      face: state.face, type: typeInfo?.type ?? "", question: trimmed,
      playerId: myId, playerName: currentPlayer?.name ?? "나",
    };
    const res = await onAction("update-state", {
      patch: { phase: "rolling", face: 0, history: [...state.history, entry] },
      turnIndex: (room.turnIndex + 1) % room.players.length,
    });
    if (res) setInput("");
  }

  const shownFace = state.phase === "writing" ? state.face : (localRolling ? displayFace : (state.face || 1));
  const typeInfo = DICE_TYPES[(state.face || 1) - 1];

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <RoomHeader game={game} room={room} subtitle={`질문 ${state.history.length}개`} onLeave={onLeave} />
      <TurnBar room={room} myId={myId} currentId={currentPlayer?.id} />

      {/* 주사위 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center gap-5">
        <div className="w-32 h-32 rounded-2xl flex items-center justify-center shadow-xl"
          style={{
            background: state.phase === "writing" ? typeInfo?.color : "#6366f1",
            transform: localRolling ? "rotate(15deg) scale(1.05)" : "none",
            transition: "transform 0.1s",
          }}>
          <svg viewBox="0 0 100 100" className="w-20 h-20">
            {(DOTS[shownFace] ?? []).map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="9" fill="white" />)}
          </svg>
        </div>

        {state.phase === "writing" && typeInfo && (
          <div className="text-center">
            <div className="inline-block rounded-full px-4 py-1.5 text-white font-black mb-1"
              style={{ background: typeInfo.color }}>{state.face}번 — {typeInfo.type}</div>
            <p className="text-gray-500 text-sm">{typeInfo.desc}</p>
          </div>
        )}

        <div className="rounded-xl px-4 py-2.5 text-center font-bold w-full"
          style={{ background: isMyTurn ? `${game.accentColor}15` : "#f9fafb", color: isMyTurn ? game.accentColor : "#9ca3af" }}>
          {isMyTurn
            ? (state.phase === "rolling" ? "🎲 주사위를 굴려요!" : "✏️ 질문을 만들어요!")
            : `⏳ ${currentPlayer?.name}님의 차례예요`}
        </div>

        {/* 내 차례 + 굴리기 단계 */}
        {isMyTurn && state.phase === "rolling" && (
          <Button onClick={roll} disabled={localRolling || actionLoading}
            className="w-full py-4 text-lg font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
            {localRolling ? "굴리는 중..." : "🎲 주사위 굴리기!"}
          </Button>
        )}
      </div>

      {/* 내 차례 + 작성 단계 */}
      {isMyTurn && state.phase === "writing" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <textarea
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none h-24"
            placeholder={`${typeInfo?.type} 유형의 질문을 만들어보세요...`}
            value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          <Button className="w-full font-bold text-white rounded-xl"
            style={{ background: typeInfo?.color, opacity: input.trim() && !actionLoading ? 1 : 0.5 }}
            disabled={!input.trim() || actionLoading} onClick={submit}>
            {actionLoading ? "전송 중..." : "제출하기 ✓"}
          </Button>
        </div>
      )}

      {!isMyTurn && (
        <WaitingBanner text={`${currentPlayer?.name}님이 ${state.phase === "rolling" ? "주사위를 굴리는" : "질문을 만드는"} 중...`} />
      )}

      {/* 기록 */}
      {state.history.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2 max-h-40 overflow-y-auto">
          {state.history.slice().reverse().map((h, i) => (
            <div key={i} className="flex gap-2 items-center text-sm">
              <span className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-black text-xs"
                style={{ background: DICE_TYPES[h.face - 1]?.color }}>{h.face}</span>
              <span className="text-xs font-bold" style={{ color: playerColorById(room, h.playerId) }}>{h.playerName}</span>
              <span className="text-gray-700 flex-1 truncate">{h.question}</span>
            </div>
          ))}
        </div>
      )}

      {/* 방장 종료 */}
      {isHost && state.history.length >= 2 && (
        <Button variant="outline" className="w-full rounded-xl text-gray-500"
          onClick={() => onAction("update-state", { patch: {}, status: "ended" })}>
          🏁 게임 마치기
        </Button>
      )}
    </div>
  );
}
