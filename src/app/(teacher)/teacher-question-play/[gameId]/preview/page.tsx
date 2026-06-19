"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BUILT_IN_GAMES, type BuiltInGame } from "@/lib/question-games-data";
import MemoryGame from "@/app/(student)/student-question-play/games/MemoryGame";
import StoryDiceGame from "@/app/(student)/student-question-play/games/StoryDiceGame";
import DiceGame from "@/app/(student)/student-question-play/games/DiceGame";
import LadderGame from "@/app/(student)/student-question-play/games/LadderGame";
import RelayGame from "@/app/(student)/student-question-play/games/RelayGame";
import MysteryBoxGame from "@/app/(student)/student-question-play/games/MysteryBoxGame";
import KabaGame from "@/app/(student)/student-question-play/games/KabaGame";
import type { GameStartConfig } from "@/app/(student)/student-question-play/[gameId]/page";

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

// 교사 체험(미리보기): 솔로 모드로 놀이를 직접 해본다. 포인트·기록은 서버에서 차단된다.
export default function TeacherGamePreview({ params }: { params: { gameId: string } }) {
  const { gameId } = params;
  const router = useRouter();

  // 게임 화면은 밝은 인라인 색이 많아 미리보기 동안 라이트 모드로 고정
  useEffect(() => {
    const html = document.documentElement;
    const wasDark = html.classList.contains("dark");
    if (wasDark) html.classList.remove("dark");
    return () => { if (wasDark) html.classList.add("dark"); };
  }, []);

  const game = BUILT_IN_GAMES.find((g) => g.id === gameId);
  const GameComponent = GAME_MAP[gameId];
  const back = () => router.push("/teacher-question-play");

  if (!game || !GameComponent) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="text-6xl">😢</div>
        <p className="text-muted-foreground text-lg font-medium">체험할 수 없는 놀이예요</p>
        <p className="text-sm text-muted-foreground">기본 제공 놀이만 미리보기를 지원해요.</p>
        <button
          className="mt-2 text-sm text-white px-5 py-2.5 rounded-xl font-bold"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
          onClick={back}
        >
          ← 관리로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5">
        <p className="text-sm font-semibold text-indigo-700">
          🎮 미리보기 모드 · 점수·기록은 저장되지 않아요
        </p>
        <button onClick={back} className="text-sm font-medium text-indigo-600 hover:underline">
          ← 관리로
        </button>
      </div>
      <GameComponent game={game} onBack={back} config={{ mode: "solo", players: ["선생님"] }} />
    </div>
  );
}
