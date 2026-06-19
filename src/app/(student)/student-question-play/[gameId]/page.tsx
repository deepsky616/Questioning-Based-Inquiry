"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { BUILT_IN_GAMES } from "@/lib/question-games-data";
import MemoryGame from "../games/MemoryGame";
import StoryDiceGame from "../games/StoryDiceGame";
import DiceGame from "../games/DiceGame";
import LadderGame from "../games/LadderGame";
import RelayGame from "../games/RelayGame";
import MysteryBoxGame from "../games/MysteryBoxGame";
import KabaGame from "../games/KabaGame";
import RoomLobby from "../games/RoomLobby";
import RoomRelay from "../games/RoomRelay";
import RoomKaba from "../games/RoomKaba";
import RoomDice from "../games/RoomDice";
import RoomStoryDice from "../games/RoomStoryDice";
import RoomMemory from "../games/RoomMemory";
import RoomLadder from "../games/RoomLadder";
import { useRoom } from "../games/useRoom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";

export type GameMode = "solo" | "friend" | "ai";

export interface GameStartConfig {
  mode: GameMode;
  players: string[];
}

type GameComponent = React.ComponentType<{
  game: BuiltInGame;
  onBack: () => void;
  config: GameStartConfig;
}>;

const GAME_MAP: Record<string, GameComponent> = {
  kaba: KabaGame as GameComponent,
  memory: MemoryGame as GameComponent,
  "story-dice": StoryDiceGame as GameComponent,
  dice: DiceGame as GameComponent,
  ladder: LadderGame as GameComponent,
  relay: RelayGame as GameComponent,
  "mystery-box": MysteryBoxGame as GameComponent,
};

type RoomGameComponent = React.ComponentType<{
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  actionLoading: boolean;
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<GameRoom | null>;
  onLeave: () => void;
}>;

// 실시간 멀티 동기화를 지원하는 게임들
const ROOM_GAME_MAP: Record<string, RoomGameComponent> = {
  relay: RoomRelay,
  kaba: RoomKaba,
  dice: RoomDice,
  "story-dice": RoomStoryDice,
  memory: RoomMemory,
  ladder: RoomLadder,
};

export default function GamePage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;

  // 질문놀이 게임 화면은 알록달록한 밝은 디자인(인라인 색 다수)이라,
  // 다크 테마에서 글씨가 안 보이는 문제를 막기 위해 플레이 동안 라이트 모드로 고정한다.
  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    if (wasDark) html.classList.remove("dark");
    return () => {
      if (wasDark) html.classList.add("dark");
    };
  }, []);

  const router = useRouter();
  const { data: session } = useSession();
  const myId = (session?.user as { id?: string } | undefined)?.id ?? "";

  const game = BUILT_IN_GAMES.find((g) => g.id === gameId);
  const GameComponent = GAME_MAP[gameId];

  const [mode, setMode] = useState<GameMode>("solo");
  const [playerName, setPlayerName] = useState("");
  const [startConfig, setStartConfig] = useState<GameStartConfig | null>(null);

  // 방(멀티) 흐름
  const { room, error: roomError, actionLoading, createRoom, joinRoom, sendAction, leaveRoom } = useRoom();
  const [roomStep, setRoomStep] = useState<"choice" | "join" | null>(null);
  const [joinCode, setJoinCode] = useState("");

  function handleBack() { router.push("/student-question-play"); }

  function startSoloOrAI() {
    const players = mode === "ai"
      ? [playerName.trim() || "나", "🤖 AI"]
      : [playerName.trim() || "나"];
    setStartConfig({ mode, players });
  }

  async function handleCreateRoom() {
    await createRoom(gameId);
  }

  async function handleJoinRoom() {
    const code = joinCode.trim();
    if (code.length !== 4) return;
    await joinRoom(code);
  }

  async function handleLeaveRoom() {
    await leaveRoom();
    setRoomStep("choice");
    setJoinCode("");
  }

  if (!game || !GameComponent) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="text-6xl">😢</div>
        <p className="text-muted-foreground text-lg font-medium">게임을 찾을 수 없어요</p>
        <button className="mt-2 text-sm text-white px-5 py-2.5 rounded-xl font-bold"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
          onClick={handleBack}>
          ← 목록으로
        </button>
      </div>
    );
  }

  /* ═══ 방(멀티) 진행 중 ═══ */
  if (room) {
    // 대기실
    if (room.status === "waiting") {
      return (
        <RoomLobby
          game={game}
          room={room}
          myId={myId}
          actionLoading={actionLoading}
          onStart={() => sendAction("start")}
          onLeave={handleLeaveRoom}
        />
      );
    }
    // 게임 진행 / 종료 — 멀티 동기화 컴포넌트
    const RoomComponent = ROOM_GAME_MAP[gameId];
    if (RoomComponent) {
      return (
        <RoomComponent
          game={game}
          room={room}
          myId={myId}
          actionLoading={actionLoading}
          onAction={sendAction}
          onLeave={handleLeaveRoom}
        />
      );
    }
    // 멀티 미지원 게임(미스터리 박스): 방 참가자 명단으로 로컬 진행
    return (
      <GameComponent
        game={game}
        onBack={handleLeaveRoom}
        config={{ mode: "friend", players: room.players.map((p) => p.name) }}
      />
    );
  }

  /* ═══ 솔로/AI 게임 진행 ═══ */
  if (startConfig) {
    return <GameComponent game={game} onBack={() => setStartConfig(null)} config={startConfig} />;
  }

  /* ═══ 친구와 함께: 방 개설/참가 선택 ═══ */
  if (roomStep === "choice") {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setRoomStep(null)} className="text-muted-foreground hover:text-gray-600 text-sm">← 뒤로</button>
          <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
            style={{ background: game.gradientCss }}>
            <span className="text-4xl">{game.emoji}</span>
            <div>
              <h1 className="text-xl font-black">{game.title}</h1>
              <p className="text-white/80 text-sm">친구와 함께 놀아요! 👥</p>
            </div>
          </div>
        </div>

        {roomError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">❌ {roomError}</div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {/* 방 개설 */}
          <button
            onClick={handleCreateRoom}
            disabled={actionLoading}
            className="bg-card rounded-2xl shadow-sm border-2 border-border p-6 flex items-center gap-5 transition-all hover:scale-[1.02] hover:shadow-md text-left"
            style={{ opacity: actionLoading ? 0.6 : 1 }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ background: game.gradientCss }}>
              🏠
            </div>
            <div>
              <h3 className="font-black text-foreground text-lg">방 개설하기</h3>
              <p className="text-muted-foreground text-sm">새 방을 만들고 방 코드를 친구에게 알려줘요</p>
            </div>
          </button>

          {/* 방 참가 */}
          <button
            onClick={() => setRoomStep("join")}
            className="bg-card rounded-2xl shadow-sm border-2 border-border p-6 flex items-center gap-5 transition-all hover:scale-[1.02] hover:shadow-md text-left">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
              style={{ background: game.gradientCss }}>
              🔑
            </div>
            <div>
              <h3 className="font-black text-foreground text-lg">방 코드 입력</h3>
              <p className="text-muted-foreground text-sm">친구가 알려준 방 코드로 참가해요</p>
            </div>
          </button>
        </div>

        {actionLoading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <span className="w-4 h-4 border-2 border-input border-t-transparent rounded-full animate-spin" />
            방을 만드는 중...
          </div>
        )}
      </div>
    );
  }

  /* ═══ 방 코드 입력 ═══ */
  if (roomStep === "join") {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => { setRoomStep("choice"); setJoinCode(""); }} className="text-muted-foreground hover:text-gray-600 text-sm">← 뒤로</button>
          <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
            style={{ background: game.gradientCss }}>
            <span className="text-4xl">🔑</span>
            <div>
              <h1 className="text-xl font-black">방 코드 입력</h1>
              <p className="text-white/80 text-sm">친구가 알려준 4자리 코드를 입력해요</p>
            </div>
          </div>
        </div>

        {roomError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">❌ {roomError}</div>
        )}

        <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-5">
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            className="w-full border-2 rounded-2xl px-4 py-5 text-5xl font-black text-center tracking-[0.4em] focus:outline-none transition-colors"
            style={{ borderColor: joinCode ? game.accentColor : "#e5e7eb" }}
            placeholder="----"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            onKeyDown={(e) => { if (e.key === "Enter" && joinCode.length === 4) handleJoinRoom(); }}
            autoFocus
          />
          <Button
            className="w-full py-4 font-black text-white rounded-xl text-lg"
            style={{ background: game.gradientCss, opacity: joinCode.length === 4 && !actionLoading ? 1 : 0.4 }}
            disabled={joinCode.length !== 4 || actionLoading}
            onClick={handleJoinRoom}>
            {actionLoading ? "참가하는 중..." : "🚪 방 참가하기"}
          </Button>
        </div>
      </div>
    );
  }

  /* ═══ 모드 선택 화면 ═══ */
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={handleBack} className="text-muted-foreground hover:text-gray-600 text-sm">← 목록</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">{game.description}</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-4">
        <h2 className="font-black text-foreground text-lg">어떻게 놀이할까요?</h2>

        <div className="grid grid-cols-3 gap-3">
          {[
            { value: "solo" as GameMode, emoji: "👤", label: "혼자하기", desc: "혼자서 연습해요" },
            { value: "friend" as GameMode, emoji: "👥", label: "친구와 함께", desc: "방 만들고 함께해요" },
            { value: "ai" as GameMode, emoji: "🤖", label: "AI와 함께", desc: "AI 파트너와 함께" },
          ].map((m) => (
            <button key={m.value}
              onClick={() => setMode(m.value)}
              className="rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all hover:scale-105"
              style={{
                borderColor: mode === m.value ? game.accentColor : "#e5e7eb",
                background: mode === m.value ? `${game.accentColor}12` : "white",
              }}>
              <span className="text-3xl">{m.emoji}</span>
              <span className="font-bold text-foreground text-sm">{m.label}</span>
              <span className="text-muted-foreground text-xs text-center leading-tight">{m.desc}</span>
            </button>
          ))}
        </div>

        {/* 친구 모드: 방 안내 */}
        {mode === "friend" && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <span className="text-2xl">👥</span>
              <div>
                <p className="text-amber-700 text-sm font-bold">친구와 함께하기</p>
                <p className="text-amber-600 text-xs">방을 만들거나 방 코드로 참가해서 같이 놀아요!</p>
              </div>
            </div>
          </div>
        )}

        {/* 솔로/AI 모드: 내 이름 */}
        {(mode === "solo" || mode === "ai") && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full text-white text-xs flex items-center justify-center font-bold flex-shrink-0"
                style={{ background: game.accentColor }}>
                나
              </div>
              <Input placeholder="내 이름 (선택)" value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="h-8 text-sm rounded-lg" />
            </div>
            {mode === "ai" && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
                <span className="text-2xl">🤖</span>
                <div>
                  <p className="text-blue-700 text-sm font-bold">AI 파트너</p>
                  <p className="text-blue-500 text-xs">선생님이 설정한 Gemini 모델이 함께 놀아요</p>
                </div>
              </div>
            )}
          </div>
        )}

        <Button
          className="w-full py-4 font-black text-white rounded-xl text-lg"
          style={{ background: game.gradientCss }}
          onClick={() => {
            if (mode === "friend") setRoomStep("choice");
            else startSoloOrAI();
          }}>
          {mode === "solo" ? "🎮 시작하기!" : mode === "friend" ? "👥 친구와 함께하기!" : "🤖 AI와 시작!"}
        </Button>
      </div>
    </div>
  );
}
