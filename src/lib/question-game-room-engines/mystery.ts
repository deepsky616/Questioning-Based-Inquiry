import {
  MYSTERY_ITEMS,
  classifyMysteryQuestion,
  getMysteryItem,
  isMysteryGuessCorrect,
  type MysteryAnswer,
  type MysteryLocale,
} from "@/lib/mystery-box-rules";
import {
  QUESTION_GAME_LIMITS,
  QUESTION_GAME_RULES,
} from "@/lib/question-game-rules";
import { isQuestionFormForLocale } from "@/lib/question-game-i18n";
import type {
  EngineStateBase,
  QuestionGameEngineResult,
  QuestionGameRoomEngine,
  QuestionGameRoomEngineContext,
  QuestionGameRoomLeaveContext,
} from "@/lib/question-game-room-engine";
import type { GameRoom } from "@/lib/question-games-data";

export type MysteryHistoryItem =
  | {
      kind: "question";
      playerId: string;
      playerName: string;
      question: string;
      answer: MysteryAnswer;
    }
  | {
      kind: "guess";
      playerId: string;
      playerName: string;
      guess: string;
      correct: boolean;
    };

export interface MysteryRoomState extends EngineStateBase {
  game: "mystery-box";
  phase: "setup" | "play" | "done";
  round: number;
  maxRounds: 20;
  turnOrder: string[];
  currentTurnIdx: number;
  history: MysteryHistoryItem[];
  scores: Record<string, number>;
  winnerId?: string;
  answer?: { ko: string; en: string };
  private?: { itemId: string };
}

export type MysteryPublicRoomState = Omit<MysteryRoomState, "private"> & {
  private?: never;
};

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECENT_COMMAND_LIMIT = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(
    (item) => typeof item === "string" && item.length > 0,
  );
}

function isScoreMap(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(
    (score) => Number.isInteger(score) && (score as number) >= 0,
  );
}

function isBoundedStoredText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim();
}

function isMysteryHistoryItem(value: unknown): value is MysteryHistoryItem {
  if (
    !isRecord(value) ||
    !isBoundedStoredText(value.playerId, QUESTION_GAME_LIMITS.shortWord) ||
    typeof value.playerName !== "string"
  ) {
    return false;
  }
  if (value.kind === "question") {
    return isBoundedStoredText(value.question, QUESTION_GAME_LIMITS.question) &&
      /[?？]/u.test(value.question) &&
      (value.answer === "yes" ||
        value.answer === "no" ||
        value.answer === "unknown");
  }
  return value.kind === "guess" &&
    isBoundedStoredText(value.guess, QUESTION_GAME_LIMITS.shortWord) &&
    typeof value.correct === "boolean";
}

function isLocalizedAnswer(
  value: unknown,
): value is { ko: string; en: string } {
  return isRecord(value) &&
    isBoundedStoredText(value.ko, QUESTION_GAME_LIMITS.shortWord) &&
    isBoundedStoredText(value.en, QUESTION_GAME_LIMITS.shortWord);
}

function hasUniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isValidPrivateState(
  value: unknown,
): value is { itemId: string } {
  return isRecord(value) &&
    Object.keys(value).length === 1 &&
    typeof value.itemId === "string" &&
    getMysteryItem(value.itemId) !== null;
}

function hasValidScores(state: MysteryRoomState): boolean {
  const questionCounts = new Map<string, number>();
  let questionCount = 0;
  for (const item of state.history) {
    if (item.kind !== "question") continue;
    questionCount += 1;
    questionCounts.set(
      item.playerId,
      (questionCounts.get(item.playerId) ?? 0) + 1,
    );
  }
  if (
    questionCount >
      QUESTION_GAME_RULES["mystery-box"].score.maxValidQuestionsPerRoom
  ) {
    return false;
  }
  return Object.entries(state.scores).every(
    ([playerId, score]) => score === (questionCounts.get(playerId) ?? 0),
  );
}

function hasValidTurn(state: MysteryRoomState): boolean {
  return hasUniqueStrings(state.turnOrder) &&
    (state.turnOrder.length === 0
      ? state.currentTurnIdx === 0
      : state.currentTurnIdx < state.turnOrder.length);
}

function hasExpectedAnswer(
  state: MysteryRoomState,
  itemId: string,
): boolean {
  const item = getMysteryItem(itemId);
  return item !== null &&
    state.answer?.ko === item.names.ko &&
    state.answer.en === item.names.en;
}

function hasValidPhase(state: MysteryRoomState): boolean {
  const guesses = state.history.filter(
    (item): item is Extract<MysteryHistoryItem, { kind: "guess" }> =>
      item.kind === "guess",
  );
  const correctGuesses = guesses.filter(({ correct }) => correct);
  if (guesses.length > state.maxRounds || correctGuesses.length > 1) {
    return false;
  }

  if (state.phase === "setup") {
    return state.round === 0 &&
      state.roundId === undefined &&
      state.turnOrder.length === 0 &&
      state.history.length === 0 &&
      Object.keys(state.scores).length === 0 &&
      state.private === undefined &&
      state.winnerId === undefined &&
      state.answer === undefined &&
      state.endReason === undefined;
  }

  if (
    state.phase === "done" &&
    state.endReason === "insufficient-players" &&
    state.round === 0
  ) {
    return state.roundId === undefined &&
      state.turnOrder.length === 0 &&
      state.history.length === 0 &&
      Object.keys(state.scores).length === 0 &&
      state.private === undefined &&
      state.winnerId === undefined &&
      state.answer === undefined;
  }

  if (
    typeof state.roundId !== "string" ||
    !UUID_V4_PATTERN.test(state.roundId) ||
    state.turnOrder.length === 0 ||
    !state.private
  ) {
    return false;
  }
  if (state.phase === "play") {
    return guesses.length < state.maxRounds &&
      correctGuesses.length === 0 &&
      state.round === guesses.length + 1 &&
      state.winnerId === undefined &&
      state.answer === undefined &&
      state.endReason === undefined;
  }

  if (state.endReason === "insufficient-players") {
    return guesses.length < state.maxRounds &&
      correctGuesses.length === 0 &&
      state.round === guesses.length + 1 &&
      state.winnerId === undefined &&
      hasExpectedAnswer(state, state.private.itemId);
  }
  if (state.endReason !== "completed" ||
    !hasExpectedAnswer(state, state.private.itemId)) {
    return false;
  }
  const lastGuess = guesses.at(-1);
  if (correctGuesses.length === 1) {
    return guesses.length > 0 &&
      state.round === guesses.length &&
      lastGuess?.correct === true &&
      state.winnerId === lastGuess.playerId;
  }
  return guesses.length === state.maxRounds &&
    state.round === state.maxRounds &&
    state.winnerId === undefined &&
    lastGuess?.correct === false;
}

export function readMysteryState(value: unknown): MysteryRoomState | null {
  if (
    !isRecord(value) ||
    value.stateVersion !== 2 ||
    value.game !== "mystery-box" ||
    (value.phase !== "setup" && value.phase !== "play" && value.phase !== "done") ||
    !isStringArray(value.recentCommandIds) ||
    value.recentCommandIds.length > RECENT_COMMAND_LIMIT ||
    !hasUniqueStrings(value.recentCommandIds) ||
    !value.recentCommandIds.every((id) => UUID_V4_PATTERN.test(id)) ||
    !Number.isInteger(value.round) ||
    (value.round as number) < 0 ||
    value.maxRounds !== QUESTION_GAME_RULES["mystery-box"].targets.room.count ||
    !isStringArray(value.turnOrder) ||
    !Number.isInteger(value.currentTurnIdx) ||
    (value.currentTurnIdx as number) < 0 ||
    !Array.isArray(value.history) ||
    !value.history.every(isMysteryHistoryItem) ||
    !isScoreMap(value.scores) ||
    (value.roundId !== undefined &&
      (typeof value.roundId !== "string" ||
        !UUID_V4_PATTERN.test(value.roundId))) ||
    (value.winnerId !== undefined &&
      (typeof value.winnerId !== "string" || value.winnerId.length === 0)) ||
    (value.answer !== undefined && !isLocalizedAnswer(value.answer)) ||
    (value.endReason !== undefined &&
      value.endReason !== "completed" &&
      value.endReason !== "insufficient-players") ||
    (value.private !== undefined && !isValidPrivateState(value.private))
  ) {
    return null;
  }
  const state = value as unknown as MysteryRoomState;
  return hasValidTurn(state) && hasValidScores(state) && hasValidPhase(state)
    ? state
    : null;
}

export function readMysteryPublicState(
  value: unknown,
): MysteryPublicRoomState | null {
  if (
    !isRecord(value) ||
    Object.prototype.hasOwnProperty.call(value, "private")
  ) {
    return null;
  }
  if (value.phase === "setup") {
    return readMysteryState(value) as MysteryPublicRoomState | null;
  }
  if (
    value.phase === "done" &&
    value.endReason === "insufficient-players" &&
    value.round === 0
  ) {
    const candidate: Record<string, unknown> = { ...value, phase: "setup" };
    delete candidate.endReason;
    return readMysteryState(candidate)
      ? value as MysteryPublicRoomState
      : null;
  }

  const publicAnswer = isLocalizedAnswer(value.answer) ? value.answer : null;
  const item = value.phase === "done" && publicAnswer
    ? MYSTERY_ITEMS.find(
        ({ names }) =>
          names.ko === publicAnswer.ko && names.en === publicAnswer.en,
      )
    : MYSTERY_ITEMS[0];
  if (!item) return null;
  const storedCandidate = {
    ...value,
    private: { itemId: item.id },
  };
  return readMysteryState(storedCandidate)
    ? value as MysteryPublicRoomState
    : null;
}

function changed(
  context: QuestionGameRoomEngineContext,
  state: MysteryRoomState,
  roomStatus?: "playing" | "ended",
): QuestionGameEngineResult {
  return {
    kind: "changed",
    room: {
      ...context.room,
      ...(roomStatus ? { status: roomStatus } : {}),
      gameState: state,
    },
  };
}

function invalid(
  context: QuestionGameRoomEngineContext,
  message: string,
): QuestionGameEngineResult {
  return { kind: "invalid", room: context.room, message };
}

function readLocale(value: unknown): MysteryLocale | null {
  return value === "ko" || value === "en" ? value : null;
}

function currentTurnPlayerId(state: MysteryRoomState): string | null {
  return state.turnOrder[state.currentTurnIdx] ?? null;
}

export function createMysteryState(): MysteryRoomState {
  return {
    stateVersion: 2,
    game: "mystery-box",
    phase: "setup",
    recentCommandIds: [],
    round: 0,
    maxRounds: QUESTION_GAME_RULES["mystery-box"].targets.room.count,
    turnOrder: [],
    currentTurnIdx: 0,
    history: [],
    scores: {},
  };
}

export function applyMysteryCommand(
  context: QuestionGameRoomEngineContext,
): QuestionGameEngineResult {
  const state = readMysteryState(context.state);
  if (!state) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "미스터리 박스 상태가 손상되었습니다",
    };
  }
  if (context.action === "mystery-start") {
    return startMystery(context, state);
  }
  if (context.action !== "mystery-ask" && context.action !== "mystery-guess") {
    return invalid(context, "지원하지 않는 미스터리 박스 명령입니다");
  }
  if (state.phase !== "play") {
    return {
      kind: "conflict",
      room: context.room,
      message: "미스터리 박스를 진행할 단계가 아닙니다",
    };
  }
  const turnPlayerId = currentTurnPlayerId(state);
  if (!turnPlayerId) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "현재 차례가 올바르지 않습니다",
    };
  }
  if (turnPlayerId !== context.userId) {
    return {
      kind: "forbidden",
      room: context.room,
      message: "현재 차례의 참가자만 질문하거나 추측할 수 있습니다",
    };
  }
  return context.action === "mystery-ask"
    ? askMysteryQuestion(context, state)
    : guessMysteryItem(context, state);
}

function startMystery(
  context: QuestionGameRoomEngineContext,
  state: MysteryRoomState,
): QuestionGameEngineResult {
  if (context.userId !== context.room.hostId) {
    return {
      kind: "forbidden",
      room: context.room,
      message: "방장만 미스터리 박스를 시작할 수 있습니다",
    };
  }
  if (state.phase !== "setup") {
    return {
      kind: "conflict",
      room: context.room,
      message: "미스터리 박스를 시작할 단계가 아닙니다",
    };
  }

  const random = context.random();
  if (!Number.isFinite(random) || random < 0 || random >= 1) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "서버 난수 결과가 올바르지 않습니다",
    };
  }
  const item = MYSTERY_ITEMS[Math.floor(random * MYSTERY_ITEMS.length)];
  if (!item) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "미스터리 물건을 고를 수 없습니다",
    };
  }

  return changed(context, {
    ...state,
    phase: "play",
    roundId: context.randomUUID(),
    round: 1,
    turnOrder: context.room.players.map(({ id }) => id),
    currentTurnIdx: 0,
    scores: Object.fromEntries(
      context.room.players.map(({ id }) => [id, 0]),
    ),
    private: { itemId: item.id },
  });
}

function askMysteryQuestion(
  context: QuestionGameRoomEngineContext,
  state: MysteryRoomState,
): QuestionGameEngineResult {
  const locale = readLocale(context.body.locale);
  if (!locale) return invalid(context, "질문 언어가 올바르지 않습니다");
  if (typeof context.body.question !== "string") {
    return invalid(context, "질문이 올바르지 않습니다");
  }
  const question = context.body.question.trim();
  if (
    question.length === 0 ||
    question.length > QUESTION_GAME_LIMITS.question ||
    !/[?？]/u.test(question) ||
    !isQuestionFormForLocale(question, locale)
  ) {
    return invalid(context, "물음표가 있는 질문을 이백 자 이내로 써 주세요");
  }
  const maxQuestions =
    QUESTION_GAME_RULES["mystery-box"].score.maxValidQuestionsPerRoom;
  const questionCount = state.history.filter(
    ({ kind }) => kind === "question",
  ).length;
  if (questionCount >= maxQuestions) {
    return invalid(context, "질문 수 상한을 모두 사용했습니다");
  }
  const item = state.private ? getMysteryItem(state.private.itemId) : null;
  const score = state.scores[context.userId];
  if (!item || !Number.isInteger(score) || score < 0) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "미스터리 박스 비공개 상태가 손상되었습니다",
    };
  }

  return changed(context, {
    ...state,
    history: [
      ...state.history,
      {
        kind: "question",
        playerId: context.userId,
        playerName: context.userName,
        question,
        answer: classifyMysteryQuestion(question, item, locale),
      },
    ],
    scores: { ...state.scores, [context.userId]: score + 1 },
  });
}

function guessMysteryItem(
  context: QuestionGameRoomEngineContext,
  state: MysteryRoomState,
): QuestionGameEngineResult {
  const locale = readLocale(context.body.locale);
  if (!locale) return invalid(context, "추측 언어가 올바르지 않습니다");
  if (typeof context.body.guess !== "string") {
    return invalid(context, "추측이 올바르지 않습니다");
  }
  const guess = context.body.guess.trim();
  if (guess.length === 0 || guess.length > QUESTION_GAME_LIMITS.shortWord) {
    return invalid(context, "추측을 팔십 자 이내로 써 주세요");
  }
  const item = state.private ? getMysteryItem(state.private.itemId) : null;
  if (!item) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "미스터리 박스 비공개 상태가 손상되었습니다",
    };
  }
  const activityCount = state.history.filter(
    ({ kind }) => kind === "guess",
  ).length;
  if (activityCount >= state.maxRounds) {
    return {
      kind: "conflict",
      room: context.room,
      message: "최대 활동을 모두 사용했습니다",
    };
  }
  const nextActivityCount = activityCount + 1;
  if (isMysteryGuessCorrect(guess, item, locale)) {
    return changed(
      context,
      {
        ...state,
        phase: "done",
        endReason: "completed",
        round: nextActivityCount,
        history: [
          ...state.history,
          {
            kind: "guess",
            playerId: context.userId,
            playerName: context.userName,
            guess,
            correct: true,
          },
        ],
        winnerId: context.userId,
        answer: { ...item.names },
      },
      "ended",
    );
  }
  if (nextActivityCount >= state.maxRounds) {
    return changed(
      context,
      {
        ...state,
        phase: "done",
        endReason: "completed",
        round: state.maxRounds,
        currentTurnIdx: (state.currentTurnIdx + 1) % state.turnOrder.length,
        history: [
          ...state.history,
          {
            kind: "guess",
            playerId: context.userId,
            playerName: context.userName,
            guess,
            correct: false,
          },
        ],
        answer: { ...item.names },
      },
      "ended",
    );
  }

  return changed(context, {
    ...state,
    roundId: context.randomUUID(),
    round: nextActivityCount + 1,
    currentTurnIdx: (state.currentTurnIdx + 1) % state.turnOrder.length,
    history: [
      ...state.history,
      {
        kind: "guess",
        playerId: context.userId,
        playerName: context.userName,
        guess,
        correct: false,
      },
    ],
  });
}

function mysteryPlayerLeft(
  context: QuestionGameRoomLeaveContext,
): GameRoom {
  const interruptedByDeparture =
    isRecord(context.room.gameState) &&
    context.room.gameState.phase === "done" &&
    context.room.gameState.endReason === "insufficient-players";
  let state = readMysteryState(context.room.gameState);
  if (!state && interruptedByDeparture) {
    const candidate: Record<string, unknown> = {
      ...context.room.gameState,
      phase: isValidPrivateState(context.room.gameState.private)
        ? "play"
        : "setup",
    };
    delete candidate.endReason;
    delete candidate.answer;
    state = readMysteryState(candidate);
  }
  if (!state) throw new Error("corrupt mystery state");

  const completed = state.phase === "done" && state.endReason === "completed";
  const activeIds = new Set(context.room.players.map(({ id }) => id));
  const scores = completed
    ? state.scores
    : Object.fromEntries(
        Object.entries(state.scores).filter(([id]) => activeIds.has(id)),
      );
  const item = state.private ? getMysteryItem(state.private.itemId) : null;
  const revealAnswer = interruptedByDeparture && item;

  return {
    ...context.room,
    gameState: {
      ...state,
      scores,
      ...(interruptedByDeparture
        ? { phase: "done", endReason: "insufficient-players" }
        : {}),
      ...(revealAnswer ? { answer: { ...revealAnswer.names } } : {}),
    },
  };
}

export const mysteryQuestionGameRoomEngine: QuestionGameRoomEngine = {
  createInitialState: createMysteryState,
  applyCommand: applyMysteryCommand,
  onPlayerLeave: mysteryPlayerLeft,
};
