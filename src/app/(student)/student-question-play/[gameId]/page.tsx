"use client";

import { use, useState } from "react";
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
import type { BuiltInGame, GameRoom, RoomActionHandler } from "@/lib/question-games-data";

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
  onAction: RoomActionHandler;
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

  // 방(멀티) 흐름
  const { room, error: roomError, actionLoading, createRoom, joinRoom, sendAction, leaveRoom } = useRoom();
  const [roomStep, setRoomStep] = useState<"choice" | "join" | null>(null);
  const [joinCode, setJoinCode] = useState("");

  function handleBack() { router.push("/student-question-play"); }

  function startSoloOrAI() {
    const players = mode === "ai"
      ? [playerName.trim() || t("defaultPlayer"), "🤖 AI"]
      : [playerName.trim() || t("defaultPlayer")];
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
    if (!(await leaveRoom())) return;
    setRoomStep("choice");
    setJoinCode("");
  }

  if (!game || !GameComponent) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="text-6xl">😢</div>
        <p className="text-muted-foreground text-lg font-medium">{t("notFound")}</p>
        <button className="mt-2 text-sm text-white px-5 py-2.5 rounded-xl font-bold"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
          onClick={handleBack}>
          {t("backToList")}
        </button>
      </div>
    );
  }

  /* ═══ 방(멀티) 진행 중 ═══ */
  if (room) {
    const roomErrorAlert = roomError ? (
      <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
        ❌ {roomError}
      </div>
    ) : null;

    // 대기실
    if (room.status === "waiting") {
      return (
        <>
          {roomErrorAlert}
          <RoomLobby
            game={game}
            room={room}
            myId={myId}
            actionLoading={actionLoading}
            onStart={() => { void sendAction("start"); }}
            onLeave={handleLeaveRoom}
          />
        </>
      );
    }
    // 게임 진행 / 종료 — 멀티 동기화 컴포넌트
    const RoomComponent = ROOM_GAME_MAP[gameId];
    if (RoomComponent) {
      return (
        <>
          {roomErrorAlert}
          <RoomComponent
            game={game}
            room={room}
            myId={myId}
            actionLoading={actionLoading}
            onAction={sendAction}
            onLeave={handleLeaveRoom}
          />
        </>
      );
    }
    // 멀티 미지원 게임(미스터리 박스): 방 참가자 명단으로 로컬 진행
    return (
      <>
        {roomErrorAlert}
        <GameComponent
          game={game}
          onBack={handleLeaveRoom}
          config={{ mode: "friend", players: room.players.map((p) => p.name) }}
        />
      </>
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
          <button onClick={() => setRoomStep(null)} className="text-muted-foreground hover:text-gray-600 text-sm">{t("back")}</button>
          <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
            style={{ background: game.gradientCss }}>
              <span className="text-4xl">{game.emoji}</span>
            <div>
              <h1 className="text-xl font-black">{game.title}</h1>
              <p className="text-white/80 text-sm">{t("playWithFriends")}</p>
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
              <h3 className="font-black text-foreground text-lg">{t("createRoomTitle")}</h3>
              <p className="text-muted-foreground text-sm">{t("createRoomDesc")}</p>
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
              <h3 className="font-black text-foreground text-lg">{t("joinRoomTitle")}</h3>
              <p className="text-muted-foreground text-sm">{t("joinRoomDesc")}</p>
            </div>
          </button>
        </div>

        {actionLoading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <span className="w-4 h-4 border-2 border-input border-t-transparent rounded-full animate-spin" />
            {t("creatingRoom")}
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
          <button onClick={() => { setRoomStep("choice"); setJoinCode(""); }} className="text-muted-foreground hover:text-gray-600 text-sm">{t("back")}</button>
          <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
            style={{ background: game.gradientCss }}>
            <span className="text-4xl">🔑</span>
            <div>
              <h1 className="text-xl font-black">{t("joinRoomTitle")}</h1>
              <p className="text-white/80 text-sm">{t("joinCodeDesc")}</p>
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
            {actionLoading ? t("joiningRoom") : t("joinRoomButton")}
          </Button>
        </div>
      </div>
    );
  }

  /* ═══ 모드 선택 화면 ═══ */
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={handleBack} className="text-muted-foreground hover:text-gray-600 text-sm">{t("backToList")}</button>
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
        <h2 className="font-black text-foreground text-lg">{t("modeTitle")}</h2>

        <div className="grid grid-cols-3 gap-3">
          {[
            { value: "solo" as GameMode, emoji: "👤", label: t("modeSolo"), desc: t("modeSoloDesc") },
            { value: "friend" as GameMode, emoji: "👥", label: t("modeFriend"), desc: t("modeFriendDesc") },
            { value: "ai" as GameMode, emoji: "🤖", label: t("modeAi"), desc: t("modeAiDesc") },
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
                <p className="text-amber-700 text-sm font-bold">{t("friendModeTitle")}</p>
                <p className="text-amber-600 text-xs">{t("friendModeDesc")}</p>
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
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">
                <span className="text-2xl">🤖</span>
                <div>
                  <p className="text-blue-700 text-sm font-bold">{t("aiPartnerTitle")}</p>
                  <p className="text-blue-500 text-xs">{t("aiPartnerDesc")}</p>
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
          {mode === "solo" ? t("startSolo") : mode === "friend" ? t("startFriend") : t("startAi")}
        </Button>
      </div>
    </div>
  );
}
