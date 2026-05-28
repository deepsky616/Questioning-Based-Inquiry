"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUILT_IN_GAMES } from "@/lib/question-games-data";
import BingoGame from "../games/BingoGame";
import HotPotatoGame from "../games/HotPotatoGame";
import DiceGame from "../games/DiceGame";
import LadderGame from "../games/LadderGame";
import RelayGame from "../games/RelayGame";
import MysteryBoxGame from "../games/MysteryBoxGame";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { BuiltInGame } from "@/lib/question-games-data";

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
  bingo: BingoGame as GameComponent,
  "hot-potato": HotPotatoGame as GameComponent,
  dice: DiceGame as GameComponent,
  ladder: LadderGame as GameComponent,
  relay: RelayGame as GameComponent,
  "mystery-box": MysteryBoxGame as GameComponent,
};

export default function GamePage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;
  const router = useRouter();
  const game = BUILT_IN_GAMES.find((g) => g.id === gameId);
  const GameComponent = GAME_MAP[gameId];

  const [phase, setPhase] = useState<"select" | "play">("select");
  const [mode, setMode] = useState<GameMode>("solo");
  const [playerCount, setPlayerCount] = useState(2);
  const [playerNames, setPlayerNames] = useState<string[]>(["", ""]);
  const [startConfig, setStartConfig] = useState<GameStartConfig | null>(null);

  function handleBack() { router.push("/student-question-play"); }

  function startGame() {
    const names =
      mode === "ai"
        ? [playerNames[0]?.trim() || "나", "🤖 AI"]
        : Array.from({ length: playerCount }, (_, i) =>
            playerNames[i]?.trim() || `학생 ${i + 1}`
          );
    setStartConfig({ mode, players: names });
    setPhase("play");
  }

  if (!game || !GameComponent) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="text-6xl">😢</div>
        <p className="text-gray-500 text-lg font-medium">게임을 찾을 수 없어요</p>
        <button className="mt-2 text-sm text-white px-5 py-2.5 rounded-xl font-bold"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
          onClick={handleBack}>
          ← 목록으로
        </button>
      </div>
    );
  }

  if (phase === "play" && startConfig) {
    return <GameComponent game={game} onBack={() => setPhase("select")} config={startConfig} />;
  }

  /* ─── 모드 선택 화면 ─── */
  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* 게임 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={handleBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">{game.description}</p>
          </div>
        </div>
      </div>

      {/* 모드 선택 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <h2 className="font-black text-gray-800 text-lg">어떻게 놀이할까요?</h2>

        <div className="grid grid-cols-3 gap-3">
          {[
            { value: "solo" as GameMode, emoji: "👤", label: "혼자하기", desc: "혼자서 연습해요" },
            { value: "friend" as GameMode, emoji: "👥", label: "친구와 함께", desc: "번갈아가며 해요" },
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
              <span className="font-bold text-gray-800 text-sm">{m.label}</span>
              <span className="text-gray-400 text-xs text-center leading-tight">{m.desc}</span>
            </button>
          ))}
        </div>

        {/* 친구 모드: 인원 + 이름 */}
        {mode === "friend" && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-700">참가 인원</span>
              <div className="flex gap-1 ml-auto">
                {[2, 3, 4].map((n) => (
                  <button key={n}
                    className="w-9 h-9 rounded-lg font-bold text-sm transition-all"
                    style={{ background: playerCount === n ? game.accentColor : "#f3f4f6", color: playerCount === n ? "white" : "#374151" }}
                    onClick={() => { setPlayerCount(n); setPlayerNames(Array(n).fill("")); }}>
                    {n}명
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {Array.from({ length: playerCount }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full text-white text-xs flex items-center justify-center font-bold flex-shrink-0"
                    style={{ background: game.accentColor }}>
                    {i + 1}
                  </div>
                  <Input placeholder={`학생 ${i + 1} 이름 (선택)`} value={playerNames[i] ?? ""}
                    onChange={(e) => { const n = [...playerNames]; n[i] = e.target.value; setPlayerNames(n); }}
                    className="h-8 text-sm rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI 모드: 내 이름 + 안내 */}
        {mode === "ai" && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full text-white text-xs flex items-center justify-center font-bold flex-shrink-0"
                style={{ background: game.accentColor }}>
                나
              </div>
              <Input placeholder="내 이름 (선택)" value={playerNames[0] ?? ""}
                onChange={(e) => { const n = [...playerNames]; n[0] = e.target.value; setPlayerNames(n); }}
                className="h-8 text-sm rounded-lg" />
            </div>
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
              <span className="text-2xl">🤖</span>
              <div>
                <p className="text-blue-700 text-sm font-bold">AI 파트너</p>
                <p className="text-blue-500 text-xs">선생님이 설정한 Gemini 모델이 함께 놀아요</p>
              </div>
            </div>
          </div>
        )}

        <Button
          className="w-full py-4 font-black text-white rounded-xl text-lg"
          style={{ background: game.gradientCss }}
          onClick={startGame}>
          {mode === "solo" ? "🎮 시작하기!" : mode === "friend" ? "👥 함께 시작!" : "🤖 AI와 시작!"}
        </Button>
      </div>
    </div>
  );
}
