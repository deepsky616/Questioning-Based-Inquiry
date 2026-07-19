"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { BUILT_IN_GAMES, localizeBuiltInGame, type BuiltInGame } from "@/lib/question-games-data";
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
export default function TeacherGamePreview({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const router = useRouter();
  const t = useTranslations("gamePreview");
  const locale = useLocale();
  const tg = useTranslations("gamePlay");

  const game = BUILT_IN_GAMES.find((g) => g.id === gameId);
  const localizedGame = game ? localizeBuiltInGame(game, locale) : null;
  const GameComponent = GAME_MAP[gameId];
  const back = () => router.push("/teacher-question-play");

  if (!localizedGame || !GameComponent) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="text-6xl">😢</div>
        <p className="text-muted-foreground text-lg font-medium">{t("cantPlay")}</p>
        <p className="text-sm text-muted-foreground">{t("builtInOnly")}</p>
        <button
          className="mt-2 text-sm text-white px-5 py-2.5 rounded-xl font-bold"
          style={{ background: "linear-gradient(135deg, #6D28D9, #BE185D)" }}
          onClick={back}
        >
          {t("backToManage")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-secondary px-4 py-2.5">
        <p className="text-sm font-semibold text-foreground">
          {t("previewMode")}
        </p>
        <button onClick={back} className="text-sm font-medium text-foreground hover:underline">
          {t("backShort")}
        </button>
      </div>
      <GameComponent game={localizedGame} onBack={back} config={{ mode: "solo", players: [t("teacherPlayer")] }} />
    </div>
  );
}
