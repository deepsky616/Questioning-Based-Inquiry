"use client";

import { useState, useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { RoomHeader, TurnBar, WaitingBanner, playerColorById } from "./roomShared";
import RoomResult from "./RoomResult";
import { getQuestionDiceTypes, getQuestionGameText } from "@/lib/question-game-i18n";
import type { BuiltInGame, GameRoom, RoomActionHandler } from "@/lib/question-games-data";

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
  onAction: RoomActionHandler;
  onLeave: () => void;
}

export default function RoomDice({ game, room, myId, actionLoading, onAction, onLeave }: Props) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const diceTypes = getQuestionDiceTypes(locale);
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
      void onAction("set-state", { state: { phase: "rolling", face: 0, history: [] }, turnIndex: 0 });
    }
  }, [isHost, hasState, room.status, onAction]);

  if (room.status === "ended") {
    const hist = state?.history ?? [];
    const scores = room.players.map((p) => ({
      playerId: p.id, name: p.name,
      score: hist.filter((h) => h.playerId === p.id).length,
    }));
    const questions = hist.map((h) => ({ playerId: h.playerId, playerName: h.playerName, question: h.question }));
    return (
      <RoomResult game={game} room={room} myId={myId}
        scoreLabel={text.question} scoreUnit={text.count}
        scores={scores} questions={questions}
        onAction={onAction} onLeave={onLeave} />
    );
  }

  if (!hasState) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <RoomHeader game={game} room={room} subtitle={text.preparing} onLeave={onLeave} />
        <WaitingBanner text={text.preparingGame} />
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
        void onAction("update-state", { patch: { phase: "writing", face: final } });
      }
    }, 100);
  }

  async function submit() {
    const trimmed = input.trim();
    if (!trimmed || actionLoading) return;
    const typeInfo = diceTypes[state.face - 1];
    const entry: DiceEntry = {
      face: state.face, type: typeInfo?.type ?? "", question: trimmed,
      playerId: myId, playerName: currentPlayer?.name ?? text.me,
    };
    const res = await onAction("update-state", {
      patch: { phase: "rolling", face: 0, history: [...state.history, entry] },
      turnIndex: (room.turnIndex + 1) % room.players.length,
    });
    if (res.ok) setInput("");
  }

  const shownFace = state.phase === "writing" ? state.face : (localRolling ? displayFace : (state.face || 1));
  const typeInfo = diceTypes[(state.face || 1) - 1];

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <RoomHeader game={game} room={room} subtitle={`${text.question} ${state.history.length}${text.count}`} onLeave={onLeave} />
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
          style={{ background: typeInfo.color }}>{state.face} — {typeInfo.type}</div>
            <p className="text-gray-500 text-sm">{typeInfo.desc}</p>
          </div>
        )}

        <div className="rounded-xl px-4 py-2.5 text-center font-bold w-full"
          style={{ background: isMyTurn ? `${game.accentColor}15` : "#f9fafb", color: isMyTurn ? game.accentColor : "#9ca3af" }}>
          {isMyTurn
            ? (state.phase === "rolling" ? text.diceRoll : (locale === "en" ? "✏️ Make a question!" : "✏️ 질문을 만들어요!"))
            : `⏳ ${text.turnOf(currentPlayer?.name ?? "")}`}
        </div>

        {/* 내 차례 + 굴리기 단계 */}
        {isMyTurn && state.phase === "rolling" && (
          <Button onClick={roll} disabled={localRolling || actionLoading}
            className="w-full py-4 text-lg font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
            {localRolling ? text.diceRolling : text.diceRoll}
          </Button>
        )}
      </div>

      {/* 내 차례 + 작성 단계 */}
      {isMyTurn && state.phase === "writing" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <textarea
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none h-24"
            placeholder={typeInfo ? text.dicePlaceholder(typeInfo.type) : ""}
            value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          <Button className="w-full font-bold text-white rounded-xl"
            style={{ background: typeInfo?.color, opacity: input.trim() && !actionLoading ? 1 : 0.5 }}
            disabled={!input.trim() || actionLoading} onClick={submit}>
            {actionLoading ? text.sending : text.submit}
          </Button>
        </div>
      )}

      {!isMyTurn && (
        <WaitingBanner text={locale === "en"
          ? `${currentPlayer?.name} is ${state.phase === "rolling" ? "rolling the die" : "making a question"}...`
          : `${currentPlayer?.name}님이 ${state.phase === "rolling" ? "주사위를 굴리는" : "질문을 만드는"} 중...`} />
      )}

      {/* 기록 */}
      {state.history.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2 max-h-40 overflow-y-auto">
          {state.history.slice().reverse().map((h, i) => (
            <div key={i} className="flex gap-2 items-center text-sm">
              <span className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-black text-xs"
                style={{ background: diceTypes[h.face - 1]?.color }}>{h.face}</span>
              <span className="text-xs font-bold" style={{ color: playerColorById(room, h.playerId) }}>{h.playerName}</span>
              <span className="text-gray-700 flex-1 truncate">{h.question}</span>
            </div>
          ))}
        </div>
      )}

      {/* 방장 종료 */}
      {isHost && state.history.length >= 2 && (
        <Button variant="outline" className="w-full rounded-xl text-gray-500"
          onClick={() => void onAction("update-state", { patch: {}, status: "ended" })}>
          {text.finishGame}
        </Button>
      )}
    </div>
  );
}
