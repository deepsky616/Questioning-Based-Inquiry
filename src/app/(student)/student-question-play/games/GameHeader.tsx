"use client";

import type { BuiltInGame } from "@/lib/question-games-data";
import { useLocale } from "next-intl";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import { LearningSoundToggle } from "@/components/shared/LearningSoundToggle";

interface GameHeaderProps {
  game: BuiltInGame;
  subtitle: string;
  onBack: () => void;
  backDisabled?: boolean;
}

export function GameHeader({ game, subtitle, onBack, backDisabled = false }: GameHeaderProps) {
  const text = getQuestionGameText(useLocale());
  return (
    <div className="game-shared-header flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        disabled={backDisabled}
        className="text-muted-foreground hover:text-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {text.backToList}
      </button>
      <div
        className="min-w-0 flex-1 rounded-2xl py-4 px-4 text-white flex items-center gap-3 sm:px-6 sm:gap-4"
        style={{ background: game.gradientCss }}
      >
        <span className="text-4xl">{game.emoji}</span>
        <div>
          <h1 className="text-xl font-black">{game.title}</h1>
          <p className="text-white text-sm">{subtitle}</p>
        </div>
      </div>
      <LearningSoundToggle />
    </div>
  );
}
