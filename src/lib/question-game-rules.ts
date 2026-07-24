export const BUILT_IN_QUESTION_GAME_IDS = [
  "memory",
  "story-dice",
  "dice",
  "ladder",
  "relay",
  "mystery-box",
  "kaba",
] as const;

export type BuiltInQuestionGameId = typeof BUILT_IN_QUESTION_GAME_IDS[number];

type QuestionGameTarget =
  | { kind: "attempts-by-difficulty"; easy: 18; normal: 30; hard: 45 }
  | { kind: "completed-pairs"; count: number; perQuestioner: boolean }
  | { kind: "student-questions"; count: 3; perPlayer: boolean }
  | { kind: "shared-rounds"; count: 3 }
  | { kind: "actions"; count: 20 }
  | { kind: "attempts"; count: 10 }
  | { kind: "attempts-per-player"; count: 3; minimumTotal: 6 };

export type QuestionGameRoomTarget =
  | { maxRounds: number }
  | { maxAttempts: number };

export const QUESTION_GAME_LIMITS = {
  commandBodyBytes: 64 * 1024,
  gameStateBytes: 128 * 1024,
  roomBytes: 160 * 1024,
  topic: 80,
  shortWord: 80,
  question: 200,
  story: 500,
  answer: 500,
  generatedWord: 60,
} as const;

export const QUESTION_GAME_RULES = {
  memory: {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 5~20분", en: "About 5-20 min" },
    targets: {
      room: { kind: "attempts-by-difficulty", easy: 18, normal: 30, hard: 45 },
      solo: { kind: "attempts-by-difficulty", easy: 18, normal: 30, hard: 45 },
      ai: { kind: "attempts-by-difficulty", easy: 18, normal: 30, hard: 45 },
    },
    score: { maxValidQuestionsPerPlayer: 0, competitiveWinner: true },
  },
  "story-dice": {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 5~20분", en: "About 5-20 min" },
    targets: {
      room: { kind: "completed-pairs", count: 2, perQuestioner: true },
      solo: { kind: "completed-pairs", count: 3, perQuestioner: false },
      ai: { kind: "completed-pairs", count: 3, perQuestioner: false },
    },
    score: { maxValidQuestionsPerPlayer: 3, competitiveWinner: false },
  },
  dice: {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 5~15분", en: "About 5-15 min" },
    targets: {
      room: { kind: "student-questions", count: 3, perPlayer: true },
      solo: { kind: "student-questions", count: 3, perPlayer: false },
      ai: { kind: "student-questions", count: 3, perPlayer: false },
    },
    score: { maxValidQuestionsPerPlayer: 3, competitiveWinner: false },
  },
  ladder: {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 10~15분", en: "About 10-15 min" },
    targets: {
      room: { kind: "shared-rounds", count: 3 },
      solo: { kind: "student-questions", count: 3, perPlayer: false },
      ai: { kind: "student-questions", count: 3, perPlayer: false },
    },
    score: { maxValidQuestionsPerPlayer: 3, competitiveWinner: false },
  },
  relay: {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 5~15분", en: "About 5-15 min" },
    targets: {
      room: { kind: "student-questions", count: 3, perPlayer: true },
      solo: { kind: "student-questions", count: 3, perPlayer: false },
      ai: { kind: "student-questions", count: 3, perPlayer: false },
    },
    score: { maxValidQuestionsPerPlayer: 3, competitiveWinner: false },
  },
  "mystery-box": {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 8~15분", en: "About 8-15 min" },
    targets: {
      room: { kind: "actions", count: 20 },
      solo: { kind: "actions", count: 20 },
      ai: { kind: "actions", count: 20 },
    },
    score: {
      maxValidQuestionsPerPlayer: 24,
      maxValidQuestionsPerRoom: 24,
      competitiveWinner: false,
    },
  },
  kaba: {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 5~15분", en: "About 5-15 min" },
    targets: {
      room: { kind: "attempts-per-player", count: 3, minimumTotal: 6 },
      solo: { kind: "attempts", count: 10 },
      ai: { kind: "attempts", count: 10 },
    },
    score: { maxValidQuestionsPerPlayer: 3, competitiveWinner: true },
  },
} as const satisfies Record<
  BuiltInQuestionGameId,
  {
    multiplayer: { min: 2; max: 8 };
    duration: { ko: string; en: string };
    targets: {
      room: QuestionGameTarget;
      solo: QuestionGameTarget;
      ai: QuestionGameTarget;
    };
    score: {
      maxValidQuestionsPerPlayer: number;
      maxValidQuestionsPerRoom?: number;
      competitiveWinner: boolean;
    };
  }
>;

const BUILT_IN_QUESTION_GAME_ID_SET: ReadonlySet<string> = new Set(
  BUILT_IN_QUESTION_GAME_IDS,
);

export function isBuiltInQuestionGameId(
  gameId: string,
): gameId is BuiltInQuestionGameId {
  return BUILT_IN_QUESTION_GAME_ID_SET.has(gameId);
}

export function getQuestionGameRule(gameId: string) {
  if (!isBuiltInQuestionGameId(gameId)) {
    throw new Error("지원하지 않는 질문놀이 식별값입니다");
  }
  return QUESTION_GAME_RULES[gameId];
}

function requireRoomPlayerCount(gameId: BuiltInQuestionGameId, playerCount: number) {
  const { min, max } = QUESTION_GAME_RULES[gameId].multiplayer;
  if (
    !Number.isSafeInteger(playerCount) ||
    playerCount < min ||
    playerCount > max
  ) {
    throw new Error(`친구 놀이 인원은 ${min}명부터 ${max}명까지여야 합니다`);
  }
}

export function getQuestionGameRoomTarget(
  gameId: "memory",
  playerCount: number,
  difficulty: "easy" | "normal" | "hard",
): { maxAttempts: number };
export function getQuestionGameRoomTarget(
  gameId: Exclude<BuiltInQuestionGameId, "memory">,
  playerCount: number,
  difficulty?: "easy" | "normal" | "hard",
): { maxRounds: number };
export function getQuestionGameRoomTarget(
  gameId: BuiltInQuestionGameId,
  playerCount: number,
  difficulty?: "easy" | "normal" | "hard",
): QuestionGameRoomTarget {
  requireRoomPlayerCount(gameId, playerCount);

  if (gameId === "memory") {
    if (!difficulty) {
      throw new Error("카드 짝 찾기 난이도가 필요합니다");
    }
    const baseAttempts = QUESTION_GAME_RULES.memory.targets.room[difficulty];
    const minimumTurns = { easy: 3, normal: 4, hard: 5 }[difficulty];
    return {
      maxAttempts: Math.max(baseAttempts, playerCount * minimumTurns),
    };
  }
  if (gameId === "mystery-box") {
    return { maxRounds: 8 + playerCount * 2 };
  }
  if (gameId === "story-dice") {
    return { maxRounds: playerCount <= 3 ? 3 : 2 };
  }
  return { maxRounds: playerCount <= 3 ? 3 : 2 };
}

export function applyQuestionGameRuleText(
  gameId: string,
  locale: "ko" | "en",
) {
  const rule = getQuestionGameRule(gameId);
  const { min, max } = rule.multiplayer;
  return {
    playerCount: locale === "en" ? `${min}-${max} players` : `${min}~${max}명`,
    duration: rule.duration[locale],
  };
}
