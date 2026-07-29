import {
  applyQuestionGameRuleText,
  isBuiltInQuestionGameId,
  QUESTION_GAME_RULES,
} from "@/lib/question-game-rules";
import {
  isGameAwardResult,
  type GameAwardResult,
} from "@/lib/game-award-result";
import {
  MYSTERY_CATEGORIES,
  MYSTERY_ITEMS,
  type MysteryCategory,
} from "@/lib/mystery-box-rules";

// 교사가 지정한 순서(gameId 배열)대로 정렬. 순서에 없는 게임은 기본 order로 뒤에 둔다.
export function sortGamesByOrder<T extends { id: string; order: number }>(
  games: T[],
  orderIds?: string[] | null,
): T[] {
  if (!orderIds || orderIds.length === 0) return [...games].sort((a, b) => a.order - b.order);
  const idx = new Map(orderIds.map((id, i) => [id, i]));
  return [...games].sort((a, b) => {
    const ia = idx.has(a.id) ? idx.get(a.id)! : 1000 + a.order;
    const ib = idx.has(b.id) ? idx.get(b.id)! : 1000 + b.order;
    return ia - ib;
  });
}

export interface BuiltInGame {
  id: string;
  title: string;
  description: string;
  emoji: string;
  gradientCss: string;
  accentColor: string;
  playerCount: string;
  duration: string;
  instructions: string[];
  isBuiltIn: true;
  order: number;
}

export interface CustomGame {
  id: string;
  title: string;
  description: string;
  emoji: string;
  gradientCss: string;
  accentColor: string;
  playerCount: string;
  duration: string;
  instructions: string[];
  isBuiltIn: false;
  teacherId: string;
  order: number;
}

export type AnyGame = BuiltInGame | CustomGame;

type BuiltInGameText = Pick<BuiltInGame, "title" | "description" | "instructions">;

const BUILT_IN_GAME_TEXT: Record<"en", Record<string, BuiltInGameText>> = {
  en: {
    memory: {
      title: "Q&A Matching",
      description: "Find matching pairs of question cards and answer cards in this memory game.",
      instructions: [
        "AI creates blue question cards and yellow answer cards.",
        "All players roll a die to decide the turn order, highest number first.",
        "On your turn, flip one question card and one answer card.",
        "If they match, keep the pair and take one more turn.",
        "If they do not match, flip them back and pass the turn.",
        "The player with the most pairs wins when all cards are gone.",
      ],
    },
    "story-dice": {
      title: "Story Dice",
      description: "Roll three dice, build a story from the words, and complete it through friends' questions.",
      instructions: [
        "The storyteller rolls three dice for a character, place, and event or object.",
        "The storyteller makes one story sentence using the three words.",
        "Other players ask questions that fit the story.",
        "The storyteller answers, and the next player continues with a new question from that answer.",
        "Repeat question and answer turns to complete the story together.",
      ],
    },
    dice: {
      title: "Question Dice",
      description: "Roll the die and create a question that matches the question type you get.",
      instructions: [
        "Roll the die.",
        "Each number is a question type: 1=factual, 2=conceptual, 3=debate, 4=imaginative, 5=comparison, 6=free choice.",
        "Create and share a question of that type within 30 seconds.",
        "Give points to the most creative question.",
      ],
    },
    ladder: {
      title: "Question Ladder",
      description: "Use a ladder draw to match players with topics for question making.",
      instructions: [
        "Draw a ladder. Write player names at the top and question topics at the bottom.",
        "Each player follows the ladder from their name.",
        "Create and present a question for the topic you land on.",
        "Enjoy the unexpected topic combinations together.",
      ],
    },
    relay: {
      title: "Question Relay",
      description: "Choose a topic and continue only with connected questions. No answers allowed.",
      instructions: [
        "Choose one topic or word, such as ocean, weather, or space.",
        "Create the first question related to the topic.",
        "The next person creates a new question connected to the previous one.",
        "No answers. Only questions. Repeating the same question is not allowed.",
      ],
    },
    "mystery-box": {
      title: "Mystery Box",
      description: "Use yes-or-no questions and guesses to identify the hidden object within the activity limit for the play mode.",
      instructions: [
        "Hide an object inside a box.",
        "Other players may ask only questions that can be answered yes or no.",
        "Each question or guess uses one activity. Solo and AI play use 20 activities; friend rooms use 12-24 based on player count.",
        "Better questions make the object easier to discover.",
      ],
    },
    kaba: {
      title: "Kaba Game",
      description: "Turn statements into questions, such as 'The cat sleeps' into 'Does the cat sleep?'",
      instructions: [
        "Read the statement shown by the teacher or screen.",
        "Change the statement into a question by speaking or writing it.",
        "Use question endings such as 'does it?', 'is it?', or 'will it?'.",
        "In AI mode, the AI teacher checks whether your question works well.",
      ],
    },
  },
};

export function localizeBuiltInGame<T extends BuiltInGame>(game: T, locale: string): T {
  const text = locale === "en" ? BUILT_IN_GAME_TEXT.en[game.id] : null;
  const ruleText = applyQuestionGameRuleText(game.id, locale === "en" ? "en" : "ko");
  return text ? { ...game, ...text, ...ruleText } : { ...game, ...ruleText };
}

export function localizeQuestionGame<T extends AnyGame>(game: T, locale: string): T {
  return game.isBuiltIn ? localizeBuiltInGame(game, locale) as T : game;
}

export function localizeQuestionGames<T extends AnyGame>(games: T[], locale: string): T[] {
  return games.map((game) => localizeQuestionGame(game, locale));
}

/* ── 멀티플레이 방(대기실) 관련 타입 ── */
export interface RoomPlayer {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
}

export interface RoomChainItem {
  question: string;
  playerId: string;
  playerName: string;
  round?: number;
  roundId?: string;
}

export type RoomStatus = "waiting" | "playing" | "ended";

export interface MysteryRoomRotation {
  usedItemIds: string[];
  recentCategories: MysteryCategory[];
}

export interface GameRoom {
  code: string;
  gameId: string;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  blockedPlayerIds?: string[];
  mysteryRotation?: MysteryRoomRotation;
  topic: string;
  chain: RoomChainItem[];
  turnIndex: number;
  gameState: Record<string, unknown>;
  version: number;
  createdAt: number;
  updatedAt: number;
  playId?: string;
  pointAwardKeyVersion?: 1 | 2;
  pointEvidenceVersion?: 1 | 2;
  pointCompletedAt?: number;
  pointParticipants?: RoomPlayer[];
  awardResult?: GameAwardResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeNumber(value) && Number.isInteger(value);
}

function isRoomPlayer(value: unknown): value is RoomPlayer {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.name === "string" &&
    typeof value.isHost === "boolean" &&
    isNonNegativeNumber(value.joinedAt)
  );
}

function isPointParticipantSnapshot(
  value: unknown,
  gameId: string,
  hostId: string,
  currentPlayers: unknown,
): value is RoomPlayer[] {
  if (
    !isBuiltInQuestionGameId(gameId) ||
    !Array.isArray(value) ||
    !value.every(isRoomPlayer) ||
    !Array.isArray(currentPlayers) ||
    !currentPlayers.every(isRoomPlayer)
  ) {
    return false;
  }
  const { min, max } = QUESTION_GAME_RULES[gameId].multiplayer;
  if (value.length < min || value.length > max) return false;

  const snapshotById = new Map(value.map((player) => [player.id, player]));
  const currentById = new Map(currentPlayers.map((player) => [player.id, player]));
  if (
    snapshotById.size !== value.length ||
    currentById.size !== currentPlayers.length ||
    currentPlayers.some((player) =>
      snapshotById.get(player.id)?.name !== player.name
    )
  ) {
    return false;
  }

  const snapshotHosts = value.filter(({ isHost }) => isHost);
  const currentHosts = currentPlayers.filter(({ isHost }) => isHost);
  if (
    snapshotHosts.length !== 1 ||
    currentHosts.length !== 1 ||
    currentHosts[0]?.id !== hostId ||
    !snapshotById.has(hostId)
  ) {
    return false;
  }
  const completionHostId = snapshotHosts[0]?.id;
  return completionHostId === undefined ||
    !currentById.has(completionHostId) ||
    completionHostId === hostId;
}

function isRoomChainItem(value: unknown): value is RoomChainItem {
  return (
    isRecord(value) &&
    typeof value.question === "string" &&
    isNonEmptyString(value.playerId) &&
    typeof value.playerName === "string" &&
    (value.round === undefined ||
      (isNonNegativeInteger(value.round) && value.round > 0)) &&
    (value.roundId === undefined || isNonEmptyString(value.roundId))
  );
}

function isBlockedPlayerList(
  value: unknown,
  players: readonly RoomPlayer[],
): value is string[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const id of value) {
    if (!isNonEmptyString(id) || ids.has(id)) return false;
    ids.add(id);
  }
  return players.every(({ id }) => !ids.has(id));
}

function isMysteryRoomRotation(
  value: unknown,
  gameId: string,
): value is MysteryRoomRotation {
  if (gameId !== "mystery-box" || !isRecord(value)) return false;
  const itemIds = new Set(MYSTERY_ITEMS.map(({ id }) => id));
  const categories = new Set<string>(MYSTERY_CATEGORIES);
  if (
    !Array.isArray(value.usedItemIds) ||
    value.usedItemIds.length > MYSTERY_ITEMS.length ||
    !value.usedItemIds.every((id) => isNonEmptyString(id) && itemIds.has(id)) ||
    new Set(value.usedItemIds).size !== value.usedItemIds.length ||
    !Array.isArray(value.recentCategories) ||
    value.recentCategories.length > 2 ||
    !value.recentCategories.every(
      (category) => isNonEmptyString(category) && categories.has(category),
    )
  ) {
    return false;
  }
  return true;
}

export function isGameRoom(value: unknown): value is GameRoom {
  return (
    isRecord(value) &&
    isNonEmptyString(value.code) &&
    isNonEmptyString(value.gameId) &&
    isNonEmptyString(value.hostId) &&
    (value.status === "waiting" ||
      value.status === "playing" ||
      value.status === "ended") &&
    Array.isArray(value.players) &&
    value.players.every(isRoomPlayer) &&
    (value.blockedPlayerIds === undefined ||
      isBlockedPlayerList(value.blockedPlayerIds, value.players)) &&
    (value.mysteryRotation === undefined ||
      isMysteryRoomRotation(value.mysteryRotation, value.gameId)) &&
    typeof value.topic === "string" &&
    Array.isArray(value.chain) &&
    value.chain.every(isRoomChainItem) &&
    isNonNegativeInteger(value.turnIndex) &&
    isRecord(value.gameState) &&
    isNonNegativeInteger(value.version) &&
    isNonNegativeNumber(value.createdAt) &&
    isNonNegativeNumber(value.updatedAt) &&
    (value.playId === undefined || isNonEmptyString(value.playId)) &&
    (value.pointAwardKeyVersion === undefined ||
      value.pointAwardKeyVersion === 1 ||
      value.pointAwardKeyVersion === 2) &&
    (value.pointEvidenceVersion === undefined ||
      value.pointEvidenceVersion === 1 ||
      value.pointEvidenceVersion === 2) &&
    (value.pointCompletedAt === undefined ||
      isNonNegativeInteger(value.pointCompletedAt)) &&
    (value.pointParticipants === undefined ||
      isPointParticipantSnapshot(
        value.pointParticipants,
        value.gameId,
        value.hostId,
        value.players,
      )) &&
    (value.awardResult === undefined || isGameAwardResult(value.awardResult))
  );
}

export function pointParticipantsForRoom(
  room: Pick<GameRoom, "players" | "pointParticipants">,
): readonly RoomPlayer[] {
  return room.pointParticipants ?? room.players;
}

export function pointStudentParticipantsForRoom(
  room: Pick<GameRoom, "players" | "pointParticipants">,
): RoomPlayer[] {
  return pointParticipantsForRoom(room).filter(({ isHost }) => !isHost);
}

export function parseGameRoom(value: unknown): GameRoom | null {
  if (!isRecord(value)) return null;
  const withVersion = value.version == null ? { ...value, version: 1 } : value;
  const gameState = isRecord(withVersion.gameState) ? withVersion.gameState : null;
  const shouldFreezeLegacyCompletionTime =
    withVersion.pointCompletedAt === undefined &&
    withVersion.status === "ended" &&
    gameState?.stateVersion === 2 &&
    gameState.phase === "done" &&
    gameState.endReason === "completed" &&
    isNonNegativeInteger(withVersion.updatedAt);
  const normalized = shouldFreezeLegacyCompletionTime
    ? { ...withVersion, pointCompletedAt: withVersion.updatedAt }
    : withVersion;
  return isGameRoom(normalized) ? normalized : null;
}

export interface RoomCommandResult {
  retryAfterMs?: number;
  roll?: number;
  replayed?: boolean;
}

export interface RoomActionSuccess {
  ok: true;
  room: GameRoom;
  result?: RoomCommandResult;
}

export interface RoomActionFailure {
  ok: false;
  room: GameRoom | null;
  status: number | null;
  error?: string;
  reason:
    | "conflict"
    | "missing"
    | "network"
    | "inactive"
    | "superseded"
    | "rejected";
}

export type RoomActionResult = RoomActionSuccess | RoomActionFailure;

export interface RoomActionOptions {
  expectedRoom?: Pick<GameRoom, "code" | "createdAt" | "playId">;
  commandId?: string;
}

export type RoomActionHandler = (
  action: string,
  extra?: Record<string, unknown>,
  options?: RoomActionOptions,
) => Promise<RoomActionResult>;

export interface GameVisibility {
  type: "all" | "hidden" | "classes" | "students";
  classKeys?: string[]; // "{grade}-{className}" 형식
  studentIds?: string[];
}

export interface GradientPreset {
  id: string;
  label: string;
  css: string;
  accent: string;
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { id: "violet", label: "보라", css: "linear-gradient(135deg, #6D28D9 0%, #5B21B6 100%)", accent: "#6D28D9" },
  { id: "orange", label: "주황", css: "linear-gradient(135deg, #C2410C 0%, #B91C1C 100%)", accent: "#C2410C" },
  { id: "blue", label: "파랑", css: "linear-gradient(135deg, #0369A1 0%, #1D4ED8 100%)", accent: "#1D4ED8" },
  { id: "green", label: "초록", css: "linear-gradient(135deg, #047857 0%, #065F46 100%)", accent: "#047857" },
  { id: "yellow", label: "노랑", css: "linear-gradient(135deg, #A16207 0%, #C2410C 100%)", accent: "#A16207" },
  { id: "pink", label: "분홍", css: "linear-gradient(135deg, #BE185D 0%, #BE123C 100%)", accent: "#BE185D" },
  { id: "indigo", label: "남색", css: "linear-gradient(135deg, #4338CA 0%, #3730A3 100%)", accent: "#4338CA" },
  { id: "teal", label: "청록", css: "linear-gradient(135deg, #0F766E 0%, #155E75 100%)", accent: "#0F766E" },
];

const SIX_DIGIT_HEX = /^#[0-9a-f]{6}$/i;
const SUPPORTED_GAME_GRADIENT = /^linear-gradient\(\s*-?\d{1,3}(?:\.\d+)?deg\s*,\s*(#[0-9a-f]{6})(?:\s+0%)?\s*,\s*(#[0-9a-f]{6})(?:\s+100%)?\s*\)$/i;
const DEFAULT_GAME_THEME = GRADIENT_PRESETS.find(({ id }) => id === "indigo")!;

function hexChannels(hex: string): [number, number, number] | null {
  if (!SIX_DIGIT_HEX.test(hex)) return null;
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function hasReadableWhiteText(hex: string): boolean {
  const channels = hexChannels(hex);
  if (!channels) return false;
  const [red, green, blue] = channels.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return 1.05 / (luminance + 0.05) >= 4.5;
}

function colorHue(hex: string): number | null {
  const channels = hexChannels(hex);
  if (!channels) return null;
  const [red, green, blue] = channels.map((value) => value / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return null;
  const hue = max === red
    ? ((green - blue) / delta) % 6
    : max === green
      ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  return (hue * 60 + 360) % 360;
}

function hueDistance(first: number, second: number): number {
  return Math.min(Math.abs(first - second), 360 - Math.abs(first - second));
}

function closestSafePreset(colors: string[]): GradientPreset {
  const sourceHues = colors
    .map(colorHue)
    .filter((hue): hue is number => hue !== null);
  if (sourceHues.length === 0) return DEFAULT_GAME_THEME;

  const score = (preset: GradientPreset) => {
    const presetHue = colorHue(preset.accent);
    if (presetHue === null) return Number.POSITIVE_INFINITY;
    return sourceHues.reduce(
      (total, sourceHue) => total + hueDistance(sourceHue, presetHue),
      0,
    );
  };

  return GRADIENT_PRESETS.reduce((closest, preset) => {
    return score(preset) < score(closest) ? preset : closest;
  }, DEFAULT_GAME_THEME);
}

export function normalizeQuestionGameTheme<
  T extends { gradientCss: string; accentColor: string },
>(game: T): T {
  const gradientMatch = game.gradientCss.match(SUPPORTED_GAME_GRADIENT);
  const gradientColors = gradientMatch ? [gradientMatch[1], gradientMatch[2]] : [];
  const safeAccent = hasReadableWhiteText(game.accentColor);
  const gradientCss = !gradientMatch
    ? DEFAULT_GAME_THEME.css
    : gradientColors.every(hasReadableWhiteText)
      ? game.gradientCss
      : closestSafePreset([
        ...gradientColors,
        ...(safeAccent ? [game.accentColor] : []),
      ]).css;
  const accentColor = hasReadableWhiteText(game.accentColor)
    ? game.accentColor
    : closestSafePreset(
      SIX_DIGIT_HEX.test(game.accentColor)
        ? [game.accentColor]
        : gradientColors,
    ).accent;

  if (gradientCss === game.gradientCss && accentColor === game.accentColor) {
    return game;
  }
  return { ...game, gradientCss, accentColor };
}

export const EMOJI_PRESETS = [
  "🎮","🎯","🎲","🃏","🎪","🎭","🎨","🎸",
  "🏆","🌟","⭐","💫","🌈","🎉","🎊","🎁",
  "🧩","🔮","🎠","🎡","🎢","🚀","🦋","🌺",
  "🍎","🎵","📚","💡","🔥","💎","🐉","🦁",
];

export const BUILT_IN_GAMES: BuiltInGame[] = [
  {
    id: "memory",
    title: "질문-대답 짝 찾기",
    description: "뒤집힌 카드 중에서 질문과 그에 딱 맞는 대답의 짝을 찾는 기억력 놀이!",
    emoji: "🃏",
    gradientCss: "linear-gradient(135deg, #6D28D9 0%, #5B21B6 100%)",
    accentColor: "#6D28D9",
    ...applyQuestionGameRuleText("memory", "ko"),
    instructions: [
      "AI가 질문 카드(파란색)와 대답 카드(노란색) 짝을 만들어요.",
      "모든 참가자가 주사위를 굴려 순서를 정해요 (큰 숫자부터).",
      "자기 차례에 질문 카드 1장과 대답 카드 1장을 뒤집어요.",
      "짝이 맞으면 카드 쌍을 가져가고 한 번 더 기회를 얻어요.",
      "짝이 틀리면 다시 뒤집고 다음 친구 차례로 넘어가요.",
      "모든 카드가 사라졌을 때 가장 많이 모은 친구가 우승!",
    ],
    isBuiltIn: true,
    order: 1,
  },
  {
    id: "story-dice",
    title: "이야기 주사위",
    description: "주사위 3개로 단어를 굴려 이야기를 만들고, 친구들의 질문으로 이야기를 완성해요!",
    emoji: "📖",
    gradientCss: "linear-gradient(135deg, #C2410C 0%, #B91C1C 100%)",
    accentColor: "#B91C1C",
    ...applyQuestionGameRuleText("story-dice", "ko"),
    instructions: [
      "술래가 주사위 3개(주인공·장소·사건/물건)를 굴려요.",
      "술래는 나온 3개 단어로 이야기 한 문장을 만들어요.",
      "다른 친구들이 차례대로 그 이야기에 어울리는 질문을 해요.",
      "술래는 친구 질문에 대답하고, 다음 친구가 그 대답에서 새 질문을 이어가요.",
      "질문→대답→질문→대답을 반복하며 이야기를 함께 완성해요!",
    ],
    isBuiltIn: true,
    order: 2,
  },
  {
    id: "dice",
    title: "질문 주사위",
    description: "주사위를 굴려 나온 숫자에 해당하는 유형의 질문을 만들어보세요!",
    emoji: "🎲",
    gradientCss: "linear-gradient(135deg, #0369A1 0%, #1D4ED8 100%)",
    accentColor: "#1D4ED8",
    ...applyQuestionGameRuleText("dice", "ko"),
    instructions: [
      "주사위를 굴려요.",
      "각 숫자는 질문 유형이에요: 1=사실 2=개념 3=논쟁 4=상상 5=비교 6=자유",
      "나온 유형에 맞는 질문을 30초 안에 만들어 발표해요.",
      "가장 창의적인 질문을 만든 친구에게 점수를 줘요!",
    ],
    isBuiltIn: true,
    order: 3,
  },
  {
    id: "ladder",
    title: "질문 사다리",
    description: "사다리 타기로 질문을 만들 친구와 주제를 동시에 정해요!",
    emoji: "🪜",
    gradientCss: "linear-gradient(135deg, #047857 0%, #065F46 100%)",
    accentColor: "#047857",
    ...applyQuestionGameRuleText("ladder", "ko"),
    instructions: [
      "칠판에 사다리를 그려요. 위쪽에 친구 이름, 아래쪽에 질문 주제를 써요.",
      "각자 자신의 이름에서 출발해 사다리를 타요.",
      "도착한 주제로 질문을 만들어 발표해요.",
      "예상치 못한 재미있는 조합을 함께 즐겨요!",
    ],
    isBuiltIn: true,
    order: 4,
  },
  {
    id: "relay",
    title: "질문 릴레이",
    description: "주제를 정하고 질문만으로 이어가요! 앞 질문과 반드시 연결된 새 질문을 만들어야 해요.",
    emoji: "🏃",
    gradientCss: "linear-gradient(135deg, #A16207 0%, #C2410C 100%)",
    accentColor: "#C2410C",
    ...applyQuestionGameRuleText("relay", "ko"),
    instructions: [
      "주제나 단어를 하나 정해요. (예: 바다, 날씨, 우주...)",
      "주제와 관련된 첫 번째 질문을 만들어요.",
      "다음 사람은 앞 질문과 연결된 새로운 질문을 만들어요.",
      "대답은 금지! 질문만 이어가요. 같은 질문 반복도 금지!",
    ],
    isBuiltIn: true,
    order: 5,
  },
  {
    id: "mystery-box",
    title: "미스터리 박스",
    description: "예 또는 아니오 질문과 추측으로 놀이 방식에 맞게 정해진 활동 안에 상자 속 물건을 맞혀보세요!",
    emoji: "📦",
    gradientCss: "linear-gradient(135deg, #BE185D 0%, #BE123C 100%)",
    accentColor: "#BE123C",
    ...applyQuestionGameRuleText("mystery-box", "ko"),
    instructions: [
      "상자 안에 물건을 넣어 숨겨요.",
      "나머지 친구들은 '네/아니오'로 대답할 수 있는 질문만 해요.",
      "질문이나 추측 한 번이 한 활동이에요. 혼자와 인공지능 놀이는 20회, 친구 방은 참여 인원에 따라 12~24회 진행해요.",
      "좋은 질문을 많이 할수록 더 쉽게 맞힐 수 있어요.",
    ],
    isBuiltIn: true,
    order: 6,
  },
  {
    id: "kaba",
    title: "까바놀이",
    description: "평서문을 질문으로 바꿔요! '고양이가 잔다' → '고양이가 자나요?'",
    emoji: "🙋",
    gradientCss: "linear-gradient(135deg, #0E7490 0%, #155E75 100%)",
    accentColor: "#0E7490",
    ...applyQuestionGameRuleText("kaba", "ko"),
    instructions: [
      "선생님이나 화면에 나온 평서문을 읽어요. 예) 고양이가 잔다",
      "평서문을 질문으로 바꿔 말하거나 써요. 예) 고양이가 자나요?",
      "문장 끝을 '~나요?', '~인가요?', '~할까요?' 등으로 바꾸면 돼요.",
      "AI 모드에서는 AI 선생님이 잘 바꿨는지 확인해 줘요!",
    ],
    isBuiltIn: true,
    order: 7,
  },
];

export function isGameVisibleToStudent(
  visibility: GameVisibility,
  student: { grade?: string | null; className?: string | null; id: string }
): boolean {
  switch (visibility.type) {
    case "all":
      return true;
    case "hidden":
      return false;
    case "classes": {
      const key = `${student.grade ?? ""}-${student.className ?? ""}`;
      return (visibility.classKeys ?? []).includes(key);
    }
    case "students":
      return (visibility.studentIds ?? []).includes(student.id);
    default:
      return true;
  }
}
