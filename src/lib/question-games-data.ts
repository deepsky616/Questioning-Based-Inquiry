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
}

export type RoomStatus = "waiting" | "playing" | "ended";

export interface GameRoom {
  code: string;
  gameId: string;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  topic: string;
  chain: RoomChainItem[];
  turnIndex: number;
  gameState: Record<string, unknown>;
  version: number;
  createdAt: number;
  updatedAt: number;
  pointAwardKeyVersion?: 1;
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

function isRoomChainItem(value: unknown): value is RoomChainItem {
  return (
    isRecord(value) &&
    typeof value.question === "string" &&
    isNonEmptyString(value.playerId) &&
    typeof value.playerName === "string"
  );
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
    typeof value.topic === "string" &&
    Array.isArray(value.chain) &&
    value.chain.every(isRoomChainItem) &&
    isNonNegativeInteger(value.turnIndex) &&
    isRecord(value.gameState) &&
    isNonNegativeInteger(value.version) &&
    isNonNegativeNumber(value.createdAt) &&
    isNonNegativeNumber(value.updatedAt) &&
    (value.pointAwardKeyVersion === undefined ||
      value.pointAwardKeyVersion === 1)
  );
}

export function parseGameRoom(value: unknown): GameRoom | null {
  if (!isRecord(value)) return null;
  const normalized = value.version == null ? { ...value, version: 1 } : value;
  return isGameRoom(normalized) ? normalized : null;
}

export type RoomActionResult =
  | { ok: true; room: GameRoom }
  | {
      ok: false;
      room: GameRoom | null;
      status: number | null;
      reason:
        | "conflict"
        | "missing"
        | "network"
        | "inactive"
        | "superseded"
        | "rejected";
    };

export interface RoomActionOptions {
  expectedRoom?: Pick<GameRoom, "code" | "createdAt">;
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
  { id: "violet", label: "보라", css: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)", accent: "#7C3AED" },
  { id: "orange", label: "주황", css: "linear-gradient(135deg, #FB923C 0%, #EF4444 100%)", accent: "#EF4444" },
  { id: "blue", label: "파랑", css: "linear-gradient(135deg, #38BDF8 0%, #2563EB 100%)", accent: "#2563EB" },
  { id: "green", label: "초록", css: "linear-gradient(135deg, #34D399 0%, #059669 100%)", accent: "#059669" },
  { id: "yellow", label: "노랑", css: "linear-gradient(135deg, #FBBF24 0%, #F97316 100%)", accent: "#F97316" },
  { id: "pink", label: "분홍", css: "linear-gradient(135deg, #F472B6 0%, #E11D48 100%)", accent: "#E11D48" },
  { id: "indigo", label: "남색", css: "linear-gradient(135deg, #818CF8 0%, #6D28D9 100%)", accent: "#6D28D9" },
  { id: "teal", label: "청록", css: "linear-gradient(135deg, #2DD4BF 0%, #0891B2 100%)", accent: "#0891B2" },
];

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
    gradientCss: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
    accentColor: "#7C3AED",
    playerCount: "1~6명",
    duration: "15~25분",
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
    gradientCss: "linear-gradient(135deg, #FB923C 0%, #EF4444 100%)",
    accentColor: "#EF4444",
    playerCount: "2~30명",
    duration: "15~25분",
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
    gradientCss: "linear-gradient(135deg, #38BDF8 0%, #2563EB 100%)",
    accentColor: "#2563EB",
    playerCount: "2~30명",
    duration: "10~20분",
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
    gradientCss: "linear-gradient(135deg, #34D399 0%, #059669 100%)",
    accentColor: "#059669",
    playerCount: "4~20명",
    duration: "15~20분",
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
    gradientCss: "linear-gradient(135deg, #FBBF24 0%, #F97316 100%)",
    accentColor: "#F97316",
    playerCount: "2~30명",
    duration: "15~25분",
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
    description: "상자 안의 물건을 보지 않고 질문만으로 맞혀보세요!",
    emoji: "📦",
    gradientCss: "linear-gradient(135deg, #F472B6 0%, #E11D48 100%)",
    accentColor: "#E11D48",
    playerCount: "2~30명",
    duration: "20~30분",
    instructions: [
      "상자 안에 물건을 넣어 숨겨요.",
      "나머지 친구들은 '네/아니오'로 대답할 수 있는 질문만 해요.",
      "20개의 질문 안에 물건을 맞히면 성공!",
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
    gradientCss: "linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)",
    accentColor: "#2563EB",
    playerCount: "1~30명",
    duration: "10~20분",
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
