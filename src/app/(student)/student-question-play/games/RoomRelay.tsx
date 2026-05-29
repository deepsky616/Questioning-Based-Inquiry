"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";

const PRESET_TOPICS = [
  "바다", "날씨", "우주", "학교", "음식",
  "동물", "계절", "가족", "미래", "환경",
];
const PLAYER_COLORS = ["#F97316", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444", "#EC4899", "#14B8A6", "#F59E0B"];

function isQuestionForm(text: string): boolean {
  const t = text.trim();
  return /[?？]/.test(t) ||
    /(나요|인가요|할까요|까요|니요|니까|가요|는지요|를까요)\s*$/.test(t);
}

interface Props {
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  actionLoading: boolean;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<GameRoom | null>;
  onLeave: () => void;
}

export default function RoomRelay({ game, room, myId, actionLoading, onAction, onLeave }: Props) {
  const [topicInput, setTopicInput] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [inputQ, setInputQ] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const chainEndRef = useRef<HTMLDivElement>(null);

  const isHost = room.hostId === myId;
  const playerCount = room.players.length;
  const currentPlayer = room.players[room.turnIndex % playerCount];
  const isMyTurn = currentPlayer?.id === myId;
  const lastItem = room.chain[room.chain.length - 1];

  const playerColor = (id: string) => {
    const i = room.players.findIndex((p) => p.id === id);
    return i >= 0 ? PLAYER_COLORS[i % PLAYER_COLORS.length] : "#9ca3af";
  };

  useEffect(() => {
    chainEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.chain.length]);

  const finalTopic = customTopic.trim() || topicInput;

  async function confirmTopic() {
    if (!finalTopic) return;
    await onAction("set-topic", { topic: finalTopic });
  }

  async function submitQuestion() {
    const trimmed = inputQ.trim();
    if (!trimmed || actionLoading) return;
    setLocalError(null);

    if (!isQuestionForm(trimmed)) {
      setLocalError("질문 형태로 써야 해요! (~나요? ~인가요? ~할까요?)");
      return;
    }
    if (room.chain.some((c) => c.question.trim() === trimmed)) {
      setLocalError("이미 나온 질문이에요!");
      return;
    }

    const result = await onAction("add-question", { question: trimmed });
    if (result) setInputQ("");
  }

  /* ─── 종료 화면 ─── */
  if (room.status === "ended") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onLeave} className="text-gray-400 hover:text-gray-600 text-sm">← 나가기</button>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-4">
          <div className="text-6xl">🏆</div>
          <h2 className="text-2xl font-black text-gray-800">릴레이 완성!</h2>
          <p className="text-gray-500 text-sm">주제: <span className="font-bold text-orange-500">{room.topic}</span></p>
          <p className="text-gray-500 text-sm">
            {playerCount}명이 함께 <span className="text-2xl font-black" style={{ color: game.accentColor }}>{room.chain.length}</span>개의 질문을 이어갔어요!
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3 max-h-80 overflow-y-auto">
          <h3 className="font-black text-gray-700">📜 전체 질문 체인</h3>
          {room.chain.map((item, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white mt-0.5"
                style={{ background: playerColor(item.playerId) }}>{i + 1}</div>
              <div className="flex-1">
                <p className="text-xs font-bold mb-0.5" style={{ color: playerColor(item.playerId) }}>{item.playerName}</p>
                <p className="text-gray-800 text-sm leading-relaxed">{item.question}</p>
              </div>
            </div>
          ))}
        </div>
        {isHost && (
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: game.gradientCss }}
            onClick={() => onAction("restart")}>
            🔄 대기실로 돌아가기
          </Button>
        )}
        {!isHost && (
          <p className="text-center text-gray-400 text-sm">방장이 다음 게임을 준비하고 있어요...</p>
        )}
      </div>
    );
  }

  /* ─── 주제 설정 (방장, topic 없을 때) ─── */
  if (!room.topic) {
    if (isHost) {
      return (
        <div className="max-w-lg mx-auto space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={onLeave} className="text-gray-400 hover:text-gray-600 text-sm">← 나가기</button>
            <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
              style={{ background: game.gradientCss }}>
              <span className="text-4xl">{game.emoji}</span>
              <div>
                <h1 className="text-xl font-black">{game.title}</h1>
                <p className="text-white/80 text-sm">주제를 정해주세요!</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
            <p className="text-sm font-black text-gray-700">🎯 주제를 골라요!</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_TOPICS.map((t) => (
                <button key={t}
                  className="px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-all"
                  style={{
                    borderColor: topicInput === t ? game.accentColor : "#e5e7eb",
                    background: topicInput === t ? game.accentColor : "white",
                    color: topicInput === t ? "white" : "#374151",
                  }}
                  onClick={() => { setTopicInput(t); setCustomTopic(""); }}>
                  {t}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="w-full border-2 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              style={{ borderColor: customTopic ? game.accentColor : "#e5e7eb" }}
              placeholder="직접 입력 (예: 공룡, 로봇...)"
              value={customTopic}
              onChange={(e) => { setCustomTopic(e.target.value); setTopicInput(""); }}
            />
            <Button className="w-full py-4 font-black text-white rounded-xl text-lg"
              style={{ background: game.gradientCss, opacity: finalTopic && !actionLoading ? 1 : 0.5 }}
              disabled={!finalTopic || actionLoading}
              onClick={confirmTopic}>
              주제 정하고 시작! →
            </Button>
          </div>
        </div>
      );
    }
    // 참가자: 방장이 주제 정하길 대기
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onLeave} className="text-gray-400 hover:text-gray-600 text-sm">← 나가기</button>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-4">
          <div className="text-5xl animate-bounce">{game.emoji}</div>
          <div className="flex items-center gap-2 text-gray-500">
            <span className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            <p className="font-medium">방장이 주제를 정하는 중...</p>
          </div>
        </div>
      </div>
    );
  }

  /* ─── 게임 진행 화면 ─── */
  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={onLeave} className="text-gray-400 hover:text-gray-600 text-sm">← 나가기</button>
        <div className="flex-1 rounded-2xl py-3 px-5 text-white flex items-center justify-between"
          style={{ background: game.gradientCss }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{game.emoji}</span>
            <div>
              <p className="font-black">{game.title}</p>
              <p className="text-white/80 text-xs">주제: {room.topic}</p>
            </div>
          </div>
          <div className="text-white text-right">
            <p className="text-2xl font-black">{room.chain.length}</p>
            <p className="text-xs opacity-80">연결됨</p>
          </div>
        </div>
      </div>

      {/* 참가자 턴 표시 */}
      <div className="flex gap-2 flex-wrap">
        {room.players.map((p) => {
          const isCurrent = currentPlayer?.id === p.id;
          return (
            <div key={p.id}
              className="rounded-xl py-2 px-3 text-center text-sm font-bold transition-all flex items-center gap-1.5"
              style={{
                background: isCurrent ? playerColor(p.id) : "#f3f4f6",
                color: isCurrent ? "white" : "#9ca3af",
              }}>
              {p.name}{p.id === myId ? " (나)" : ""} {isCurrent && "🏃"}
            </div>
          );
        })}
      </div>

      {/* 현재 차례 안내 배너 */}
      <div className="rounded-xl px-4 py-3 text-center font-bold"
        style={{
          background: isMyTurn ? `${game.accentColor}15` : "#f9fafb",
          color: isMyTurn ? game.accentColor : "#9ca3af",
        }}>
        {isMyTurn ? "🙋 내 차례예요! 질문을 만들어요" : `⏳ ${currentPlayer?.name}님의 차례를 기다려요`}
      </div>

      {/* 질문 체인 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 max-h-64 overflow-y-auto space-y-2">
        {room.chain.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <p className="text-3xl mb-2">🎯</p>
            <p>주제 <strong className="text-orange-500">{room.topic}</strong>에 대한 첫 질문을 기다려요!</p>
          </div>
        ) : (
          room.chain.map((item, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
                style={{ background: playerColor(item.playerId) }}>{i + 1}</div>
              <div className={`flex-1 rounded-xl px-3 py-2 text-sm leading-relaxed ${
                i === room.chain.length - 1 ? "border-2 font-medium" : "bg-gray-50 text-gray-600"
              }`}
                style={i === room.chain.length - 1 ? {
                  borderColor: playerColor(item.playerId),
                  background: `${playerColor(item.playerId)}10`,
                  color: "#1f2937",
                } : {}}>
                <span className="text-xs font-bold mr-1.5" style={{ color: playerColor(item.playerId) }}>
                  {item.playerName}
                </span>
                {item.question}
              </div>
            </div>
          ))
        )}
        <div ref={chainEndRef} />
      </div>

      {/* 앞 질문 연결 힌트 */}
      {lastItem && isMyTurn && (
        <div className="rounded-xl border-2 px-4 py-3"
          style={{ borderColor: game.accentColor, background: `${game.accentColor}08` }}>
          <p className="text-xs font-bold mb-1" style={{ color: game.accentColor }}>↳ 이 질문과 연결하세요</p>
          <p className="text-gray-800 text-sm font-medium">{lastItem.question}</p>
        </div>
      )}

      {/* 입력 (내 차례일 때만) */}
      {isMyTurn ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          {localError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-600 text-sm">❌ {localError}</div>
          )}
          <textarea
            className="w-full border-2 rounded-xl p-3 text-sm resize-none focus:outline-none h-24"
            style={{ borderColor: "#e5e7eb" }}
            onFocus={(e) => { e.target.style.borderColor = game.accentColor; setLocalError(null); }}
            onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
            placeholder={room.chain.length === 0
              ? `'${room.topic}'과 관련된 첫 질문을 만들어보세요...`
              : "앞 질문과 연결된 새 질문을 써보세요..."}
            value={inputQ}
            onChange={(e) => { setInputQ(e.target.value); setLocalError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitQuestion(); } }}
            autoFocus
          />
          <Button className="w-full font-bold text-white rounded-xl"
            style={{ background: game.gradientCss, opacity: inputQ.trim() && !actionLoading ? 1 : 0.4 }}
            disabled={!inputQ.trim() || actionLoading}
            onClick={submitQuestion}>
            {actionLoading ? "전송 중..." : "질문 연결 →"}
          </Button>
          <p className="text-xs text-gray-400 text-center">💡 질문 형태로 써야 해요 (~나요? ~인가요?)</p>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-2xl p-5 text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500">
            <span className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">{currentPlayer?.name}님이 질문을 만드는 중...</p>
          </div>
        </div>
      )}

      {/* 방장: 종료 버튼 */}
      {isHost && room.chain.length >= 2 && (
        <Button variant="outline" className="w-full rounded-xl text-gray-500"
          onClick={() => onAction("end")}>
          🏁 게임 마치기
        </Button>
      )}
    </div>
  );
}
