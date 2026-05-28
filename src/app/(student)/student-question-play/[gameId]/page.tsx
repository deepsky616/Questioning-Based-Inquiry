"use client";

import { useRouter } from "next/navigation";
import { BUILT_IN_GAMES } from "@/lib/question-games-data";
import BingoGame from "../games/BingoGame";
import HotPotatoGame from "../games/HotPotatoGame";
import DiceGame from "../games/DiceGame";
import LadderGame from "../games/LadderGame";
import RelayGame from "../games/RelayGame";
import MysteryBoxGame from "../games/MysteryBoxGame";
import type { BuiltInGame } from "@/lib/question-games-data";

type GameComponent = React.ComponentType<{ game: BuiltInGame; onBack: () => void }>;

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

  function handleBack() {
    router.push("/student-question-play");
  }

  if (!game || !GameComponent) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="text-6xl">😢</div>
        <p className="text-gray-500 text-lg font-medium">게임을 찾을 수 없어요</p>
        <button
          className="mt-2 text-sm text-white px-5 py-2.5 rounded-xl font-bold"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
          onClick={handleBack}
        >
          ← 목록으로
        </button>
      </div>
    );
  }

  return <GameComponent game={game} onBack={handleBack} />;
}
