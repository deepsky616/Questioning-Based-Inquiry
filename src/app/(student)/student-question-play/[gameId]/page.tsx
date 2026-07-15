"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { BUILT_IN_GAMES, localizeBuiltInGame } from "@/lib/question-games-data";
import MemoryGame from "../games/MemoryGame";
import StoryDiceGame from "../games/StoryDiceGame";
import DiceGame from "../games/DiceGame";
import LadderGame from "../games/LadderGame";
import RelayGame from "../games/RelayGame";
import MysteryBoxGame from "../games/MysteryBoxGame";
import KabaGame from "../games/KabaGame";
import { QuestionGameRoomFlow } from "@/components/question-games/QuestionGameRoomFlow";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { BuiltInGame } from "@/lib/question-games-data";
import { hasStoredGameRoomMarker } from "../games/useRoom";

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

export default function GamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = use(params);
  const t = useTranslations("gamePlay");
  const locale = useLocale();

  const router = useRouter();
  const { data: session } = useSession();
  const myId = (session?.user as { id?: string } | undefined)?.id ?? "";

  const baseGame = BUILT_IN_GAMES.find((g) => g.id === gameId);
  const game = baseGame ? localizeBuiltInGame(baseGame, locale) : undefined;
  const GameComponent = GAME_MAP[gameId];

  const [mode, setMode] = useState<GameMode>("solo");
  const [playerName, setPlayerName] = useState("");
  const [startConfig, setStartConfig] = useState<GameStartConfig | null>(null);
  const [showRoomFlow, setShowRoomFlow] = useState<boolean | null>(null);

  useEffect(() => {
    setShowRoomFlow(hasStoredGameRoomMarker(gameId));
  }, [gameId]);

  function handleBack() { router.push("/student-question-play"); }

  function startSoloOrAI() {
    const players = mode === "ai"
      ? [playerName.trim() || t("defaultPlayer"), "🤖 AI"]
      : [playerName.trim() || t("defaultPlayer")];
    setStartConfig({ mode, players });
  }

  if (showRoomFlow === null) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="py-16 text-center text-sm text-muted-foreground"
      >
        {t("restoringRoom")}
      </p>
    );
  }

  if (!game || !GameComponent) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="text-6xl">😢</div>
        <p className="text-muted-foreground text-lg font-medium">{t("notFound")}</p>
        <button className="mt-2 text-sm text-white px-5 py-2.5 rounded-xl font-bold"
          style={{ background: "linear-gradient(135deg, #6D28D9, #BE185D)" }}
          onClick={handleBack}>
          {t("backToList")}
        </button>
      </div>
    );
  }

  if (showRoomFlow) {
    return (
      <QuestionGameRoomFlow
        game={game}
        myId={myId}
        allowJoin
        onExit={() => setShowRoomFlow(false)}
      />
    );
  }

  /* ═══ 솔로/AI 게임 진행 ═══ */
  if (startConfig) {
    return <GameComponent game={game} onBack={() => setStartConfig(null)} config={startConfig} />;
  }

  /* ═══ 모드 선택 화면 ═══ */
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={handleBack} className="text-muted-foreground hover:text-foreground text-sm">{t("backToList")}</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white text-sm">{game.description}</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-4">
        <h2 className="font-black text-foreground text-lg">{t("modeTitle")}</h2>

        <div data-testid="question-game-mode-options" className="grid grid-cols-3 gap-3">
          {[
            { value: "solo" as GameMode, emoji: "👤", label: t("modeSolo"), desc: t("modeSoloDesc") },
            { value: "friend" as GameMode, emoji: "👥", label: t("modeFriend"), desc: t("modeFriendDesc") },
            { value: "ai" as GameMode, emoji: "🤖", label: t("modeAi"), desc: t("modeAiDesc") },
          ].map((m) => (
            <button key={m.value}
              onClick={() => setMode(m.value)}
              className="rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-all hover:scale-105"
              style={{
                borderColor: mode === m.value ? game.accentColor : "hsl(var(--border))",
                background: mode === m.value ? `${game.accentColor}12` : "hsl(var(--background))",
              }}>
              <span className="text-3xl">{m.emoji}</span>
              <span className="font-bold text-foreground text-sm">{m.label}</span>
              <span className="text-foreground text-xs text-center leading-tight">{m.desc}</span>
            </button>
          ))}
        </div>

        {/* 친구 모드: 방 안내 */}
        {mode === "friend" && (
          <div className="pt-2 border-t border-border">
            <div className="flex items-center gap-3 bg-secondary border border-border rounded-xl p-3">
              <span className="text-2xl">👥</span>
              <div>
                <p className="text-foreground text-sm font-bold">{t("friendModeTitle")}</p>
                <p className="text-secondary-foreground text-xs">{t("friendModeDesc")}</p>
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
                {t("meBadge")}
              </div>
              <Input placeholder={t("namePlaceholder")} value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="h-8 text-sm rounded-lg" />
            </div>
            {mode === "ai" && (
              <div className="flex items-center gap-3 bg-secondary border border-border rounded-xl p-3">
                <span className="text-2xl">🤖</span>
                <div>
                  <p className="text-foreground text-sm font-bold">{t("aiPartnerTitle")}</p>
                  <p className="text-secondary-foreground text-xs">{t("aiPartnerDesc")}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <Button
          className="w-full py-4 font-black text-white rounded-xl text-lg"
          style={{ background: game.gradientCss }}
          onClick={() => {
            if (mode === "friend") setShowRoomFlow(true);
            else startSoloOrAI();
          }}>
          {mode === "solo" ? t("startSolo") : mode === "friend" ? t("startFriend") : t("startAi")}
        </Button>
      </div>
    </div>
  );
}
