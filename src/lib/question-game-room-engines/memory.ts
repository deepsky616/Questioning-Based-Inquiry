import {
  MEMORY_DIFFICULTY,
  shuffleWithRandom,
  type MemoryDifficulty,
  type QAPair,
} from "@/lib/memory-game-data";
import {
  QUESTION_GAME_LIMITS,
  QUESTION_GAME_RULES,
  getQuestionGameRoomTarget,
} from "@/lib/question-game-rules";
import type { GameRoom } from "@/lib/question-games-data";
import type {
  EngineStateBase,
  QuestionGameEngineResult,
  QuestionGameRoomEngine,
  QuestionGameRoomEngineContext,
  QuestionGameRoomLeaveContext,
} from "@/lib/question-game-room-engine";

const MISS_REVEAL_MS = 2_500;
const RESOLVED_REVEAL_LIMIT = 64;

export interface MemoryCard {
  id: string;
  pairId: string;
  type: "q" | "a";
}

export interface MemoryRoomState extends EngineStateBase {
  game: "memory";
  phase: "setup" | "rolling" | "play" | "done";
  difficulty: MemoryDifficulty;
  pairs: QAPair[];
  qCards: MemoryCard[];
  aCards: MemoryCard[];
  diceRolls: Record<string, number>;
  turnOrder: string[];
  currentTurnIdx: number;
  takenIds: string[];
  revealedIds: string[];
  scores: Record<string, number>;
  attempts: number;
  maxAttempts: number;
  lastReveal: null | {
    revealId: string;
    result: "match" | "miss";
    turnPlayerId: string;
    resolveAt: number;
  };
  lastResolvedRevealId?: string;
  resolvedRevealIds?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMemoryDifficulty(value: unknown): value is MemoryDifficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function localizedText(
  value: unknown,
  maxLength: number,
): { ko: string; en: string } | null {
  if (!isRecord(value)) return null;
  const ko = boundedText(value.ko, maxLength);
  const en = boundedText(value.en, maxLength);
  return ko && en ? { ko, en } : null;
}

function normalizePair(value: unknown, id: string): QAPair | null {
  if (!isRecord(value)) return null;
  const question = boundedText(value.question, QUESTION_GAME_LIMITS.question);
  const answer = boundedText(value.answer, QUESTION_GAME_LIMITS.answer);
  if (!question || !answer) return null;

  const questionText = value.questionText === undefined
    ? undefined
    : localizedText(value.questionText, QUESTION_GAME_LIMITS.question);
  const answerText = value.answerText === undefined
    ? undefined
    : localizedText(value.answerText, QUESTION_GAME_LIMITS.answer);
  if (
    (value.questionText !== undefined && !questionText) ||
    (value.answerText !== undefined && !answerText)
  ) {
    return null;
  }

  return {
    id,
    question,
    answer,
    ...(questionText ? { questionText } : {}),
    ...(answerText ? { answerText } : {}),
  };
}

function isIntegerMap(value: unknown, min: number, max: number): boolean {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (item) =>
        typeof item === "number" &&
        Number.isInteger(item) &&
        item >= min &&
        item <= max,
    )
  );
}

function isMemoryCard(value: unknown): value is MemoryCard {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.pairId === "string" &&
    value.pairId.length > 0 &&
    (value.type === "q" || value.type === "a")
  );
}

function isStoredPair(value: unknown): value is QAPair {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    boundedText(value.question, QUESTION_GAME_LIMITS.question) !== null &&
    boundedText(value.answer, QUESTION_GAME_LIMITS.answer) !== null
  );
}

function isLastReveal(
  value: unknown,
): value is NonNullable<MemoryRoomState["lastReveal"]> {
  return (
    isRecord(value) &&
    typeof value.revealId === "string" &&
    value.revealId.length > 0 &&
    (value.result === "match" || value.result === "miss") &&
    typeof value.turnPlayerId === "string" &&
    value.turnPlayerId.length > 0 &&
    typeof value.resolveAt === "number" &&
    Number.isFinite(value.resolveAt) &&
    value.resolveAt >= 0
  );
}

function hasUniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function hasSameStrings(
  values: readonly string[],
  expected: readonly string[],
): boolean {
  if (!hasUniqueStrings(values) || values.length !== expected.length) {
    return false;
  }
  const expectedSet = new Set(expected);
  return values.every((value) => expectedSet.has(value));
}

function hasValidBoard(state: MemoryRoomState): boolean {
  const expectedPairCount = MEMORY_DIFFICULTY[state.difficulty].pairs;
  const emptyBoard = state.pairs.length === 0;
  const mayHaveEmptyBoard =
    state.phase === "setup" ||
    (state.phase === "done" && state.endReason === "insufficient-players");
  if (emptyBoard) {
    return mayHaveEmptyBoard &&
      state.qCards.length === 0 &&
      state.aCards.length === 0;
  }
  if (
    state.phase === "setup" ||
    state.pairs.length !== expectedPairCount ||
    state.qCards.length !== expectedPairCount ||
    state.aCards.length !== expectedPairCount
  ) {
    return false;
  }

  const pairIds = state.pairs.map(({ id }) => id);
  const qPairIds = state.qCards.map(({ pairId }) => pairId);
  const aPairIds = state.aCards.map(({ pairId }) => pairId);
  const cardIds = [...state.qCards, ...state.aCards].map(({ id }) => id);
  return hasUniqueStrings(pairIds) &&
    hasUniqueStrings(cardIds) &&
    state.qCards.every(({ type }) => type === "q") &&
    state.aCards.every(({ type }) => type === "a") &&
    hasSameStrings(qPairIds, pairIds) &&
    hasSameStrings(aPairIds, pairIds);
}

function hasValidCardCollections(state: MemoryRoomState): boolean {
  const cards = [...state.qCards, ...state.aCards];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  if (
    !hasUniqueStrings(state.takenIds) ||
    !hasUniqueStrings(state.revealedIds) ||
    !state.takenIds.every((id) => cardById.has(id)) ||
    !state.revealedIds.every((id) => cardById.has(id))
  ) {
    return false;
  }

  const taken = new Set(state.takenIds);
  if (state.revealedIds.some((id) => taken.has(id))) return false;
  return state.pairs.every(({ id: pairId }) => {
    const question = state.qCards.find((card) => card.pairId === pairId);
    const answer = state.aCards.find((card) => card.pairId === pairId);
    return question !== undefined &&
      answer !== undefined &&
      taken.has(question.id) === taken.has(answer.id);
  });
}

function scoreTotal(scores: Record<string, number>): number {
  return Object.values(scores).reduce((total, score) => total + score, 0);
}

function hasValidReveal(state: MemoryRoomState): boolean {
  const cardById = new Map(
    [...state.qCards, ...state.aCards].map((card) => [card.id, card]),
  );
  const resolvedRevealIds = readResolvedRevealIds(state);
  if (resolvedRevealIds.includes(state.lastReveal?.revealId ?? "")) {
    return false;
  }

  if (state.lastReveal?.result === "miss") {
    if (state.phase !== "play" || state.revealedIds.length !== 2) {
      return false;
    }
    const question = cardById.get(state.revealedIds[0]);
    const answer = cardById.get(state.revealedIds[1]);
    return question?.type === "q" &&
      answer?.type === "a" &&
      question.pairId !== answer.pairId;
  }

  if (state.phase === "setup" || state.phase === "rolling") {
    return state.revealedIds.length === 0 && state.lastReveal === null;
  }
  if (state.phase === "play") {
    if (state.lastReveal?.result === "match") {
      return state.revealedIds.length === 0;
    }
    if (state.revealedIds.length === 0) return true;
    return state.revealedIds.length === 1 &&
      cardById.get(state.revealedIds[0])?.type === "q";
  }
  if (state.endReason === "insufficient-players") {
    return state.revealedIds.length === 0 && state.lastReveal === null;
  }
  if (
    state.lastReveal === null &&
    state.lastResolvedRevealId === undefined
  ) {
    return false;
  }

  const taken = new Set(state.takenIds);
  const expectedRevealedIds = [...state.qCards, ...state.aCards]
    .filter(({ id }) => !taken.has(id))
    .map(({ id }) => id);
  if (
    expectedRevealedIds.length === 0 &&
    state.lastReveal?.result !== "match"
  ) {
    return false;
  }
  return hasSameStrings(state.revealedIds, expectedRevealedIds);
}

function hasValidPhase(state: MemoryRoomState): boolean {
  const matchedPairs = state.takenIds.length / 2;
  const recordedMisses = readResolvedRevealIds(state).length +
    (state.lastReveal?.result === "miss" ? 1 : 0);
  const expectedMaxAttempts = state.playerCountAtStart === undefined
    ? QUESTION_GAME_RULES.memory.targets.room[state.difficulty]
    : Number.isSafeInteger(state.playerCountAtStart) &&
        state.playerCountAtStart >= QUESTION_GAME_RULES.memory.multiplayer.min &&
        state.playerCountAtStart <= QUESTION_GAME_RULES.memory.multiplayer.max
      ? getQuestionGameRoomTarget(
          "memory",
          state.playerCountAtStart,
          state.difficulty,
        ).maxAttempts
      : -1;
  if (
    state.maxAttempts !== expectedMaxAttempts ||
    state.attempts > state.maxAttempts ||
    state.attempts < matchedPairs ||
    recordedMisses > state.attempts - matchedPairs ||
    (state.lastReveal?.result === "miss" &&
      state.attempts <= matchedPairs) ||
    scoreTotal(state.scores) !== matchedPairs ||
    !hasUniqueStrings(state.turnOrder) ||
    (state.turnOrder.length === 0
      ? state.currentTurnIdx !== 0
      : state.currentTurnIdx >= state.turnOrder.length)
  ) {
    return false;
  }

  const emptyCollections =
    Object.keys(state.diceRolls).length === 0 &&
    state.turnOrder.length === 0 &&
    state.takenIds.length === 0 &&
    state.revealedIds.length === 0 &&
    Object.keys(state.scores).length === 0 &&
    state.attempts === 0 &&
    state.lastReveal === null;
  if (state.phase === "setup") {
    return state.difficulty === "normal" &&
      state.pairs.length === 0 &&
      emptyCollections &&
      state.roundId === undefined &&
      state.endReason === undefined &&
      state.lastResolvedRevealId === undefined &&
      readResolvedRevealIds(state).length === 0;
  }
  if (state.pairs.length > 0 &&
    (typeof state.roundId !== "string" || state.roundId.length === 0)) {
    return false;
  }
  if (state.phase === "rolling") {
    return state.turnOrder.length === 0 &&
      state.takenIds.length === 0 &&
      state.revealedIds.length === 0 &&
      state.attempts === 0 &&
      scoreTotal(state.scores) === 0 &&
      state.lastReveal === null &&
      state.endReason === undefined &&
      state.lastResolvedRevealId === undefined;
  }
  if (state.phase === "play") {
    return state.turnOrder.length > 0 &&
      state.endReason === undefined &&
      (state.attempts < state.maxAttempts ||
        state.lastReveal?.result === "miss");
  }
  if (
    state.endReason !== "completed" &&
    state.endReason !== "insufficient-players"
  ) {
    return false;
  }
  if (state.endReason === "insufficient-players") return true;

  const allPairsTaken = matchedPairs === state.pairs.length;
  return allPairsTaken || state.attempts === state.maxAttempts;
}

export function readMemoryState(value: unknown): MemoryRoomState | null {
  if (
    !isRecord(value) ||
    value.stateVersion !== 2 ||
    value.game !== "memory" ||
    (value.phase !== "setup" &&
      value.phase !== "rolling" &&
      value.phase !== "play" &&
      value.phase !== "done") ||
    !Array.isArray(value.recentCommandIds) ||
    !isMemoryDifficulty(value.difficulty) ||
    !Array.isArray(value.pairs) ||
    !value.pairs.every(isStoredPair) ||
    !Array.isArray(value.qCards) ||
    !value.qCards.every(isMemoryCard) ||
    !Array.isArray(value.aCards) ||
    !value.aCards.every(isMemoryCard) ||
    !isIntegerMap(value.diceRolls, 1, 6) ||
    !Array.isArray(value.turnOrder) ||
    !value.turnOrder.every((id) => typeof id === "string") ||
    typeof value.currentTurnIdx !== "number" ||
    !Number.isInteger(value.currentTurnIdx) ||
    value.currentTurnIdx < 0 ||
    !Array.isArray(value.takenIds) ||
    !value.takenIds.every((id) => typeof id === "string") ||
    !Array.isArray(value.revealedIds) ||
    !value.revealedIds.every((id) => typeof id === "string") ||
    !isIntegerMap(value.scores, 0, Number.MAX_SAFE_INTEGER) ||
    typeof value.attempts !== "number" ||
    !Number.isInteger(value.attempts) ||
    value.attempts < 0 ||
    typeof value.maxAttempts !== "number" ||
    !Number.isInteger(value.maxAttempts) ||
    value.maxAttempts < 1 ||
    (value.lastReveal !== null && !isLastReveal(value.lastReveal)) ||
    (value.lastResolvedRevealId !== undefined &&
      (typeof value.lastResolvedRevealId !== "string" ||
        value.lastResolvedRevealId.length === 0)) ||
    (value.resolvedRevealIds !== undefined &&
      (!Array.isArray(value.resolvedRevealIds) ||
        value.resolvedRevealIds.length > RESOLVED_REVEAL_LIMIT ||
        !value.resolvedRevealIds.every(
          (id) => typeof id === "string" && id.length > 0,
        ) ||
        !hasUniqueStrings(value.resolvedRevealIds)))
  ) {
    return null;
  }
  const state = value as MemoryRoomState;
  if (state.resolvedRevealIds !== undefined) {
    const latestResolvedRevealId = state.resolvedRevealIds.at(-1);
    if (latestResolvedRevealId !== state.lastResolvedRevealId) return null;
  }
  return hasValidBoard(state) &&
      hasValidCardCollections(state) &&
      hasValidPhase(state) &&
      hasValidReveal(state)
    ? state
    : null;
}

function readResolvedRevealIds(state: MemoryRoomState): string[] {
  if (state.resolvedRevealIds !== undefined) return state.resolvedRevealIds;
  return state.lastResolvedRevealId ? [state.lastResolvedRevealId] : [];
}

function appendResolvedRevealId(
  state: MemoryRoomState,
  revealId: string,
): string[] {
  return [
    ...readResolvedRevealIds(state).filter((id) => id !== revealId),
    revealId,
  ].slice(-RESOLVED_REVEAL_LIMIT);
}

function changed(
  context: QuestionGameRoomEngineContext,
  state: MemoryRoomState,
  result?: { roll?: number; replayed?: boolean; retryAfterMs?: number },
  roomStatus?: "playing" | "ended",
): QuestionGameEngineResult {
  return {
    kind: "changed",
    room: {
      ...context.room,
      ...(roomStatus ? { status: roomStatus } : {}),
      gameState: state,
    },
    ...(result ? { result } : {}),
  };
}

function invalid(
  context: QuestionGameRoomEngineContext,
  message: string,
): QuestionGameEngineResult {
  return { kind: "invalid", room: context.room, message };
}

function prepareMemory(
  context: QuestionGameRoomEngineContext,
  state: MemoryRoomState,
): QuestionGameEngineResult {
  if (context.userId !== context.room.hostId) {
    return {
      kind: "forbidden",
      room: context.room,
      message: "방장만 카드를 준비할 수 있습니다",
    };
  }
  if (state.phase !== "setup") {
    return {
      kind: "conflict",
      room: context.room,
      message: "카드를 준비할 단계가 아닙니다",
    };
  }
  const difficulty = context.body.difficulty;
  const inputPairs = context.body.pairs;
  if (!isMemoryDifficulty(difficulty) || !Array.isArray(inputPairs)) {
    return invalid(context, "난이도와 질문-대답 짝이 올바르지 않습니다");
  }
  const pairCount = MEMORY_DIFFICULTY[difficulty].pairs;
  if (inputPairs.length !== pairCount) {
    return invalid(context, "난이도에 맞는 질문-대답 짝 수가 필요합니다");
  }

  const pairs: QAPair[] = [];
  const qCards: MemoryCard[] = [];
  const aCards: MemoryCard[] = [];
  for (const inputPair of inputPairs) {
    const pairId = context.randomUUID();
    const pair = normalizePair(inputPair, pairId);
    if (!pair) {
      return invalid(context, "질문 또는 대답의 길이가 올바르지 않습니다");
    }
    pairs.push(pair);
    qCards.push({
      id: context.randomUUID(),
      pairId,
      type: "q",
    });
    aCards.push({
      id: context.randomUUID(),
      pairId,
      type: "a",
    });
  }

  const nextState: MemoryRoomState = {
    ...state,
    phase: "rolling",
    roundId: context.randomUUID(),
    difficulty,
    pairs,
    qCards: shuffleWithRandom(qCards, context.random),
    aCards: shuffleWithRandom(aCards, context.random),
    diceRolls: {},
    turnOrder: [],
    currentTurnIdx: 0,
    takenIds: [],
    revealedIds: [],
    scores: Object.fromEntries(
      context.room.players.map(({ id }) => [id, 0]),
    ),
    attempts: 0,
    maxAttempts: state.playerCountAtStart === undefined
      ? QUESTION_GAME_RULES.memory.targets.room[difficulty]
      : getQuestionGameRoomTarget(
          "memory",
          state.playerCountAtStart,
          difficulty,
        ).maxAttempts,
    lastReveal: null,
    resolvedRevealIds: [],
  };
  delete nextState.lastResolvedRevealId;
  return changed(context, nextState);
}

function rollMemory(
  context: QuestionGameRoomEngineContext,
  state: MemoryRoomState,
): QuestionGameEngineResult {
  if (state.phase !== "rolling") {
    return {
      kind: "conflict",
      room: context.room,
      message: "주사위를 굴릴 단계가 아닙니다",
    };
  }
  if (!context.room.players.some(({ id }) => id === context.userId)) {
    return {
      kind: "forbidden",
      room: context.room,
      message: "참가자만 주사위를 굴릴 수 있습니다",
    };
  }
  const existing = state.diceRolls[context.userId];
  if (existing !== undefined) {
    return {
      kind: "replayed",
      room: context.room,
      result: { roll: existing, replayed: true },
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
  const roll = Math.floor(random * 6) + 1;
  const diceRolls = { ...state.diceRolls, [context.userId]: roll };
  const allRolled = context.room.players.every(
    ({ id }) => diceRolls[id] !== undefined,
  );
  const turnOrder = allRolled
    ? context.room.players
      .map((player, index) => ({ id: player.id, index }))
      .sort(
        (left, right) =>
          diceRolls[right.id] - diceRolls[left.id] ||
          left.index - right.index,
      )
      .map(({ id }) => id)
    : [];
  return changed(
    context,
    {
      ...state,
      phase: allRolled ? "play" : "rolling",
      diceRolls,
      turnOrder,
      currentTurnIdx: 0,
    },
    { roll, replayed: false },
  );
}

function allCards(state: MemoryRoomState): MemoryCard[] {
  return [...state.qCards, ...state.aCards];
}

function remainingCardIds(
  state: MemoryRoomState,
  takenIds: readonly string[],
): string[] {
  const taken = new Set(takenIds);
  return allCards(state)
    .filter(({ id }) => !taken.has(id))
    .map(({ id }) => id);
}

function currentTurnPlayerId(state: MemoryRoomState): string | null {
  if (
    state.turnOrder.length === 0 ||
    state.currentTurnIdx >= state.turnOrder.length
  ) {
    return null;
  }
  return state.turnOrder[state.currentTurnIdx] ?? null;
}

function flipMemoryCard(
  context: QuestionGameRoomEngineContext,
  state: MemoryRoomState,
): QuestionGameEngineResult {
  if (state.phase !== "play") {
    return {
      kind: "conflict",
      room: context.room,
      message: "카드를 뒤집을 단계가 아닙니다",
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
      message: "현재 차례의 참가자만 카드를 뒤집을 수 있습니다",
    };
  }
  if (state.lastReveal?.result === "miss") {
    return {
      kind: "conflict",
      room: context.room,
      message: "틀린 카드가 복원될 때까지 기다려 주세요",
    };
  }
  if (state.attempts >= state.maxAttempts) {
    return {
      kind: "conflict",
      room: context.room,
      message: "최대 시도를 모두 사용했습니다",
    };
  }

  const cardId = context.body.cardId;
  if (typeof cardId !== "string" || cardId.length === 0) {
    return invalid(context, "카드 식별값이 올바르지 않습니다");
  }
  const cards = allCards(state);
  const card = cards.find(({ id }) => id === cardId);
  if (!card) return invalid(context, "카드를 찾을 수 없습니다");
  if (state.takenIds.includes(cardId) || state.revealedIds.includes(cardId)) {
    return invalid(context, "이미 선택한 카드입니다");
  }

  if (state.revealedIds.length === 0) {
    if (card.type !== "q") {
      return invalid(context, "질문 카드를 먼저 뒤집어야 합니다");
    }
    return changed(context, {
      ...state,
      revealedIds: [card.id],
      lastReveal: null,
    });
  }
  if (state.revealedIds.length !== 1) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "공개 카드 상태가 올바르지 않습니다",
    };
  }
  if (card.type !== "a") {
    return invalid(context, "대답 카드를 다음에 뒤집어야 합니다");
  }

  const questionCard = state.qCards.find(
    ({ id }) => id === state.revealedIds[0],
  );
  if (!questionCard) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "공개 질문 카드를 찾을 수 없습니다",
    };
  }
  const attempts = state.attempts + 1;
  const revealId = context.randomUUID();
  if (questionCard.pairId !== card.pairId) {
    return changed(context, {
      ...state,
      revealedIds: [questionCard.id, card.id],
      attempts,
      lastReveal: {
        revealId,
        result: "miss",
        turnPlayerId,
        resolveAt: context.now + MISS_REVEAL_MS,
      },
    });
  }

  const score = state.scores[turnPlayerId];
  if (!Number.isInteger(score) || score < 0) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "참가자 점수가 올바르지 않습니다",
    };
  }
  const takenIds = [...state.takenIds, questionCard.id, card.id];
  const completed = remainingCardIds(state, takenIds).length === 0;
  const reachedMaxAttempts = attempts >= state.maxAttempts;
  const done = completed || reachedMaxAttempts;
  return changed(
    context,
    {
      ...state,
      phase: done ? "done" : "play",
      ...(done ? { endReason: "completed" as const } : {}),
      takenIds,
      revealedIds: reachedMaxAttempts && !completed
        ? remainingCardIds(state, takenIds)
        : [],
      scores: { ...state.scores, [turnPlayerId]: score + 1 },
      attempts,
      lastReveal: {
        revealId,
        result: "match",
        turnPlayerId,
        resolveAt: context.now,
      },
    },
    undefined,
    done ? "ended" : undefined,
  );
}

function resolveMemoryMiss(
  context: QuestionGameRoomEngineContext,
  state: MemoryRoomState,
): QuestionGameEngineResult {
  if (!context.room.players.some(({ id }) => id === context.userId)) {
    return {
      kind: "forbidden",
      room: context.room,
      message: "참가자만 카드를 복원할 수 있습니다",
    };
  }
  const revealId = context.body.revealId;
  if (typeof revealId !== "string" || revealId.length === 0) {
    return invalid(context, "공개 식별값이 올바르지 않습니다");
  }
  if (
    readResolvedRevealIds(state).includes(revealId) &&
    state.lastReveal?.revealId !== revealId
  ) {
    return { kind: "replayed", room: context.room };
  }
  if (state.lastReveal === null) {
    return {
      kind: "conflict",
      room: context.room,
      message: "복원할 공개 카드가 없습니다",
    };
  }
  if (
    state.lastReveal.result !== "miss" ||
    state.lastReveal.revealId !== revealId
  ) {
    return {
      kind: "conflict",
      room: context.room,
      message: "공개 식별값이 현재 카드와 다릅니다",
    };
  }

  if (context.now < state.lastReveal.resolveAt) {
    const retryAfterMs = Math.max(
      0,
      Math.min(
        MISS_REVEAL_MS,
        Math.ceil(state.lastReveal.resolveAt - context.now),
      ),
    );
    return {
      kind: "replayed",
      room: context.room,
      result: { retryAfterMs },
    };
  }

  const reachedMaxAttempts = state.attempts >= state.maxAttempts;
  if (reachedMaxAttempts) {
    return changed(
      context,
      {
        ...state,
        phase: "done",
        endReason: "completed",
        revealedIds: remainingCardIds(state, state.takenIds),
        lastReveal: null,
        lastResolvedRevealId: revealId,
        resolvedRevealIds: appendResolvedRevealId(state, revealId),
      },
      undefined,
      "ended",
    );
  }

  const revealOwnerStillActive = context.room.players.some(
    ({ id }) => id === state.lastReveal?.turnPlayerId,
  );
  const nextTurnIdx =
    state.turnOrder.length === 0 || !revealOwnerStillActive
      ? state.currentTurnIdx
      : (state.currentTurnIdx + 1) % state.turnOrder.length;
  return changed(context, {
    ...state,
    currentTurnIdx: nextTurnIdx,
    revealedIds: [],
    lastReveal: null,
    lastResolvedRevealId: revealId,
    resolvedRevealIds: appendResolvedRevealId(state, revealId),
  });
}

function keepActiveValues(
  values: Record<string, number>,
  activeIds: ReadonlySet<string>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).filter(([id]) => activeIds.has(id)),
  );
}

function releaseScoredPairs(
  state: MemoryRoomState,
  score: number,
): string[] {
  if (score === 0) return state.takenIds;

  const cardById = new Map(allCards(state).map((card) => [card.id, card]));
  const takenPairIds: string[] = [];
  const seenPairIds = new Set<string>();
  for (const cardId of state.takenIds) {
    const pairId = cardById.get(cardId)?.pairId;
    if (pairId && !seenPairIds.has(pairId)) {
      seenPairIds.add(pairId);
      takenPairIds.push(pairId);
    }
  }
  const releasedPairIds = new Set(takenPairIds.slice(-score));
  return state.takenIds.filter((cardId) => {
    const pairId = cardById.get(cardId)?.pairId;
    return pairId === undefined || !releasedPairIds.has(pairId);
  });
}

function readMemoryStateForLeave(
  value: unknown,
  leavingPlayerId: string,
): MemoryRoomState | null {
  const direct = readMemoryState(value);
  if (direct) return direct;
  if (!isRecord(value)) return null;

  const candidate: Record<string, unknown> = { ...value };
  if (
    candidate.phase === "done" &&
    candidate.endReason === "insufficient-players"
  ) {
    const hasBoard = Array.isArray(candidate.pairs) && candidate.pairs.length > 0;
    const hasTurn = Array.isArray(candidate.turnOrder) &&
      candidate.turnOrder.length > 0;
    candidate.phase = !hasBoard ? "setup" : hasTurn ? "play" : "rolling";
    delete candidate.endReason;
  }
  if (
    candidate.phase === "play" &&
    Array.isArray(candidate.turnOrder) &&
    candidate.turnOrder.length === 0
  ) {
    candidate.turnOrder = [leavingPlayerId];
    candidate.currentTurnIdx = 0;
  }
  return readMemoryState(candidate);
}

function memoryPlayerLeft(
  context: QuestionGameRoomLeaveContext,
): GameRoom {
  const interruptedByDeparture =
    isRecord(context.room.gameState) &&
    context.room.gameState.endReason === "insufficient-players";
  const state = readMemoryStateForLeave(
    context.room.gameState,
    context.userId,
  );
  if (!state) throw new Error("corrupt memory state");

  const activeIds = new Set(context.room.players.map(({ id }) => id));
  const diceRolls = keepActiveValues(state.diceRolls, activeIds);
  const completed = state.phase === "done" && state.endReason === "completed";
  const scores = completed
    ? state.scores
    : keepActiveValues(state.scores, activeIds);
  const departedScore = state.scores[context.userId] ?? 0;
  const takenIds = completed
    ? state.takenIds
    : releaseScoredPairs(state, departedScore);
  const revealOwnerLeft = state.lastReveal?.turnPlayerId === context.userId;
  const clearMatchedReveal =
    !completed && revealOwnerLeft && state.lastReveal?.result === "match";
  const clearFirstCard =
    context.wasCurrentTurn === true &&
    state.phase === "play" &&
    state.lastReveal === null &&
    state.revealedIds.length === 1;
  const insufficientPlayers = interruptedByDeparture;
  const clearReveal =
    clearMatchedReveal || clearFirstCard || insufficientPlayers;
  const resolvedRevealId =
    insufficientPlayers && state.lastReveal?.result === "miss"
      ? state.lastReveal.revealId
      : state.lastResolvedRevealId;
  const resolvedRevealIds =
    insufficientPlayers && state.lastReveal?.result === "miss"
      ? appendResolvedRevealId(state, state.lastReveal.revealId)
      : state.resolvedRevealIds;

  let nextState: MemoryRoomState = {
    ...state,
    diceRolls,
    scores,
    takenIds,
    ...(completed
      ? { revealedIds: remainingCardIds(state, takenIds) }
      : {}),
    ...(clearReveal
      ? {
          revealedIds: [],
          lastReveal: null,
          ...(resolvedRevealId
            ? {
                lastResolvedRevealId: resolvedRevealId,
                ...(resolvedRevealIds
                  ? { resolvedRevealIds }
                  : {}),
              }
            : {}),
        }
      : {}),
    ...(insufficientPlayers
      ? { phase: "done", endReason: "insufficient-players" }
      : {}),
  };
  const status = context.room.status;

  if (
    nextState.phase === "rolling" &&
    status === "playing" &&
    context.room.players.length > 0 &&
    context.room.players.every(({ id }) => diceRolls[id] !== undefined)
  ) {
    const turnOrder = context.room.players
      .map((player, index) => ({ id: player.id, index }))
      .sort(
        (left, right) =>
          diceRolls[right.id] - diceRolls[left.id] ||
          left.index - right.index,
      )
      .map(({ id }) => id);
    nextState = {
      ...nextState,
      phase: "play",
      turnOrder,
      currentTurnIdx: 0,
    };
  }

  const validatedState = readMemoryState(nextState);
  if (
    context.room.players.length > 0 &&
    (!validatedState || !matchesRoomParticipants(context.room, validatedState))
  ) {
    throw new Error("corrupt memory state after player leave");
  }

  return { ...context.room, status, gameState: nextState };
}

export function createMemoryState(
  context?: QuestionGameRoomEngineContext,
): MemoryRoomState {
  const playerCountAtStart = context?.room.players.length;
  return {
    stateVersion: 2,
    game: "memory",
    phase: "setup",
    recentCommandIds: [],
    difficulty: "normal",
    pairs: [],
    qCards: [],
    aCards: [],
    diceRolls: {},
    turnOrder: [],
    currentTurnIdx: 0,
    takenIds: [],
    revealedIds: [],
    scores: {},
    attempts: 0,
    maxAttempts: playerCountAtStart === undefined
      ? QUESTION_GAME_RULES.memory.targets.room.normal
      : getQuestionGameRoomTarget(
          "memory",
          playerCountAtStart,
          "normal",
        ).maxAttempts,
    ...(playerCountAtStart === undefined ? {} : { playerCountAtStart }),
    lastReveal: null,
    resolvedRevealIds: [],
  };
}

function matchesRoomParticipants(
  room: GameRoom,
  state: MemoryRoomState,
): boolean {
  const playerIds = room.players.map(({ id }) => id);
  if (!hasUniqueStrings(playerIds)) return false;

  const scoreIds = Object.keys(state.scores);
  const diceIds = Object.keys(state.diceRolls);
  const emptyBoard = state.pairs.length === 0;
  const needsPlayerScores = state.phase !== "setup" && !emptyBoard;
  const completed = state.phase === "done" && state.endReason === "completed";
  const validScorePlayers = completed
    ? playerIds.every((id) => scoreIds.includes(id))
    : hasSameStrings(scoreIds, playerIds);
  if (
    (needsPlayerScores
      ? !validScorePlayers
      : scoreIds.length !== 0) ||
    !diceIds.every((id) => playerIds.includes(id))
  ) {
    return false;
  }

  if (state.phase === "play" ||
    (state.phase === "done" && state.endReason === "completed")) {
    return hasSameStrings(diceIds, playerIds) &&
      hasSameStrings(state.turnOrder, playerIds);
  }
  if (state.phase === "done" && state.endReason === "insufficient-players") {
    return state.turnOrder.length === 0 ||
      hasSameStrings(state.turnOrder, playerIds);
  }
  return state.turnOrder.length === 0;
}

export function applyMemoryCommand(
  context: QuestionGameRoomEngineContext,
): QuestionGameEngineResult {
  const state = readMemoryState(context.state);
  if (!state || !matchesRoomParticipants(context.room, state)) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "짝 찾기 상태가 손상되었습니다",
    };
  }
  if (context.action === "memory-prepare") {
    return prepareMemory(context, state);
  }
  if (context.action === "memory-roll") {
    return rollMemory(context, state);
  }
  if (context.action === "memory-flip") {
    return flipMemoryCard(context, state);
  }
  if (context.action === "memory-resolve-miss") {
    return resolveMemoryMiss(context, state);
  }
  return invalid(context, "지원하지 않는 짝 찾기 명령입니다");
}

export const memoryQuestionGameRoomEngine: QuestionGameRoomEngine = {
  createInitialState: createMemoryState,
  applyCommand: applyMemoryCommand,
  onPlayerLeave: memoryPlayerLeft,
};
