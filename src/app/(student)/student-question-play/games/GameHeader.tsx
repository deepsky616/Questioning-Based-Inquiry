"use client";

import type { BuiltInGame } from "@/lib/question-games-data";

interface GameHeaderProps {
  game: BuiltInGame;
  subtitle: string;
  onBack: () => void;
}

export function GameHeader({ game, subtitle, onBack }: GameHeaderProps) {
  return (
    <div className="game-shared-header flex items-center gap-3">
      <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">
        ← 목록
      </button>
      <div
        className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
        style={{ background: game.gradientCss }}
      >
        <span className="text-4xl">{game.emoji}</span>
        <div>
          <h1 className="text-xl font-black">{game.title}</h1>
          <p className="text-white/80 text-sm">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
