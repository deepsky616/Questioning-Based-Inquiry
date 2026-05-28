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
    id: "bingo",
    title: "질문 빙고",
    description: "9칸 빙고판에 다양한 유형의 질문을 채워가며 빙고를 완성하세요!",
    emoji: "🎯",
    gradientCss: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
    accentColor: "#7C3AED",
    playerCount: "2~30명",
    duration: "20~30분",
    instructions: [
      "빙고판의 각 칸에 서로 다른 유형의 질문을 하나씩 적어요.",
      "친구들과 돌아가며 자신이 만든 질문을 발표해요.",
      "발표된 질문 유형이 내 빙고판에 있으면 그 칸을 표시해요.",
      "가로, 세로, 대각선 중 한 줄을 먼저 완성하면 '빙고!'를 외쳐요.",
    ],
    isBuiltIn: true,
    order: 1,
  },
  {
    id: "hot-potato",
    title: "뜨거운 감자",
    description: "음악이 멈추면 감자를 든 사람이 질문을 만들어요! 빠르게 전달하세요!",
    emoji: "🥔",
    gradientCss: "linear-gradient(135deg, #FB923C 0%, #EF4444 100%)",
    accentColor: "#EF4444",
    playerCount: "5~30명",
    duration: "15~25분",
    instructions: [
      "음악이 재생되는 동안 감자(공 또는 물건)를 옆 친구에게 빠르게 전달해요.",
      "음악이 멈추면 감자를 들고 있는 사람이 주인공이 돼요!",
      "주인공은 선생님이 제시한 주제로 질문을 만들어 발표해요.",
      "모든 친구가 한 번씩 발표할 때까지 계속 게임을 진행해요.",
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
    description: "앞 친구의 대답에서 새로운 질문을 만들어 이어가는 릴레이 게임!",
    emoji: "🏃",
    gradientCss: "linear-gradient(135deg, #FBBF24 0%, #F97316 100%)",
    accentColor: "#F97316",
    playerCount: "5~30명",
    duration: "15~25분",
    instructions: [
      "첫 번째 친구가 주제에 대한 질문을 만들어 발표해요.",
      "두 번째 친구는 앞 질문에 짧게 대답하고, 그 대답에서 새 질문을 만들어요.",
      "계속 이어가며 질문 릴레이를 연결해요.",
      "더 이상 질문을 만들지 못하면 그 팀은 탈락! 가장 오래 이어가는 팀이 승리!",
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
