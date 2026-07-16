import { randomInt, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  isQuestionGameRunRecord,
  parseQuestionGameRunResult,
  QUESTION_GAME_REQUEST_ID_PATTERN,
  QuestionGameRunError,
  type QuestionGameRunCreateStateInput,
  type QuestionGameRunDefinition,
  type QuestionGameRunMode,
  type QuestionGameRunProgressContext,
  type QuestionGameRunResult,
} from "@/lib/question-game-run-definition";
import {
  MEMORY_DIFFICULTY,
  MEMORY_FALLBACK_PAIRS,
  MEMORY_FALLBACK_PAIRS_EN,
  type MemoryDifficulty,
} from "@/lib/memory-game-data";
import { QUESTION_GAME_RULES } from "@/lib/question-game-rules";

export const MEMORY_MISS_REVEAL_MS = 1_800;

export type MemoryActor = "STUDENT" | "AI";
export type MemoryNextStep =
  | "STUDENT_QUESTION"
  | "STUDENT_ANSWER"
  | "AI_TURN"
  | "RESOLVE_MISS"
  | "COMPLETE";

export interface MemoryPairPlan {
  pairKey: string;
  contentKey: string;
}

export interface MemoryRunCard {
  id: string;
  pairKey: string;
  type: "q" | "a";
}

export interface MemoryMissReveal {
  id: string;
  actor: MemoryActor;
  result: "MISS";
  resolveAt: number;
}

export interface MemoryRunState {
  game: "memory";
  locale: "ko" | "en";
  difficulty: MemoryDifficulty;
  targetCount: number;
  questionCount: number;
  aiTurnCount: number;
  activitySequence: number;
  memoryNextStep: MemoryNextStep;
  currentActor: MemoryActor;
  studentMatchCount: number;
  aiMatchCount: number;
  missCount: number;
  pairs: MemoryPairPlan[];
  qCards: MemoryRunCard[];
  aCards: MemoryRunCard[];
  takenIds: string[];
  revealedIds: string[];
  seenCardIds: string[];
  pendingMiss?: MemoryMissReveal;
  result?: QuestionGameRunResult;
}

type RandomIndex = (upperExclusive: number) => number;
type RandomId = () => string;

const CONTENT_KEYS = MEMORY_FALLBACK_PAIRS.map((_, index) =>
  `memory-pair-${String(index + 1).padStart(2, "0")}`
);
const CONTENT_KEY_PATTERN = /^memory-pair-(0[1-9]|1[0-9]|20)$/;

function damaged(): never {
  throw new QuestionGameRunError("카드 짝 찾기 실행 상태가 손상되었습니다", 409);
}

function secureRandomIndex(upperExclusive: number): number {
  return randomInt(0, upperExclusive);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function isDifficulty(value: unknown): value is MemoryDifficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

function isSafeCount(value: unknown, max: number): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= max;
}

function parseUniqueIds(value: unknown): string[] {
  if (
    !isDenseArray(value) ||
    !value.every((item) =>
      typeof item === "string" && QUESTION_GAME_REQUEST_ID_PATTERN.test(item)
    ) ||
    new Set(value).size !== value.length
  ) damaged();
  return [...value] as string[];
}

function parsePairs(value: unknown, difficulty: MemoryDifficulty): MemoryPairPlan[] {
  if (!isDenseArray(value) || value.length !== MEMORY_DIFFICULTY[difficulty].pairs) {
    damaged();
  }
  const pairs = value.map((item) => {
    if (
      !isQuestionGameRunRecord(item) ||
      typeof item.pairKey !== "string" ||
      !QUESTION_GAME_REQUEST_ID_PATTERN.test(item.pairKey) ||
      typeof item.contentKey !== "string" ||
      !CONTENT_KEY_PATTERN.test(item.contentKey)
    ) damaged();
    return { pairKey: item.pairKey, contentKey: item.contentKey };
  });
  if (
    new Set(pairs.map(({ pairKey }) => pairKey)).size !== pairs.length ||
    new Set(pairs.map(({ contentKey }) => contentKey)).size !== pairs.length
  ) damaged();
  return pairs;
}

function parseCards(
  value: unknown,
  type: "q" | "a",
  pairs: readonly MemoryPairPlan[],
): MemoryRunCard[] {
  if (!isDenseArray(value) || value.length !== pairs.length) damaged();
  const pairKeys = new Set(pairs.map(({ pairKey }) => pairKey));
  const cards = value.map((item) => {
    if (
      !isQuestionGameRunRecord(item) ||
      typeof item.id !== "string" ||
      !QUESTION_GAME_REQUEST_ID_PATTERN.test(item.id) ||
      typeof item.pairKey !== "string" ||
      !pairKeys.has(item.pairKey) ||
      item.type !== type
    ) damaged();
    return { id: item.id, pairKey: item.pairKey, type };
  });
  if (
    new Set(cards.map(({ id }) => id)).size !== cards.length ||
    new Set(cards.map(({ pairKey }) => pairKey)).size !== cards.length
  ) damaged();
  return cards;
}

function parsePendingMiss(value: unknown): MemoryMissReveal | undefined {
  if (value === undefined) return undefined;
  if (
    !isQuestionGameRunRecord(value) ||
    typeof value.id !== "string" ||
    !QUESTION_GAME_REQUEST_ID_PATTERN.test(value.id) ||
    (value.actor !== "STUDENT" && value.actor !== "AI") ||
    value.result !== "MISS" ||
    typeof value.resolveAt !== "number" ||
    !Number.isSafeInteger(value.resolveAt) ||
    value.resolveAt < 1
  ) damaged();
  return {
    id: value.id,
    actor: value.actor,
    result: "MISS",
    resolveAt: value.resolveAt,
  };
}

export function memoryAllCards(state: Pick<MemoryRunState, "qCards" | "aCards">) {
  return [...state.qCards, ...state.aCards];
}

export function memoryContentKeyForCard(
  state: Pick<MemoryRunState, "pairs" | "qCards" | "aCards">,
  cardId: string,
): string {
  const card = memoryAllCards(state).find(({ id }) => id === cardId);
  const contentKey = state.pairs.find(({ pairKey }) => pairKey === card?.pairKey)?.contentKey;
  if (!contentKey) damaged();
  return contentKey;
}

export function parseMemoryState(value: Prisma.JsonValue): MemoryRunState {
  if (!isQuestionGameRunRecord(value) || !isDifficulty(value.difficulty)) damaged();
  const difficulty = value.difficulty;
  const targetCount = QUESTION_GAME_RULES.memory.targets.solo[difficulty];
  const pairs = parsePairs(value.pairs, difficulty);
  const qCards = parseCards(value.qCards, "q", pairs);
  const aCards = parseCards(value.aCards, "a", pairs);
  const takenIds = parseUniqueIds(value.takenIds);
  const revealedIds = parseUniqueIds(value.revealedIds);
  const seenCardIds = parseUniqueIds(value.seenCardIds);
  const pendingMiss = parsePendingMiss(value.pendingMiss);
  const result = parseQuestionGameRunResult(value.result);
  if (
    value.game !== "memory" ||
    (value.locale !== "ko" && value.locale !== "en") ||
    value.targetCount !== targetCount ||
    !isSafeCount(value.questionCount, targetCount) ||
    !isSafeCount(value.aiTurnCount, targetCount) ||
    !isSafeCount(value.activitySequence, 2 * targetCount + targetCount + 1) ||
    (value.memoryNextStep !== "STUDENT_QUESTION" &&
      value.memoryNextStep !== "STUDENT_ANSWER" &&
      value.memoryNextStep !== "AI_TURN" &&
      value.memoryNextStep !== "RESOLVE_MISS" &&
      value.memoryNextStep !== "COMPLETE") ||
    (value.currentActor !== "STUDENT" && value.currentActor !== "AI") ||
    !isSafeCount(value.studentMatchCount, pairs.length) ||
    !isSafeCount(value.aiMatchCount, pairs.length) ||
    !isSafeCount(value.missCount, targetCount)
  ) damaged();
  const cardIds = [...qCards, ...aCards].map(({ id }) => id);
  const allSecurityIds = [
    ...pairs.map(({ pairKey }) => pairKey),
    ...cardIds,
  ];
  if (new Set(allSecurityIds).size !== allSecurityIds.length) damaged();
  return {
    game: "memory",
    locale: value.locale,
    difficulty,
    targetCount,
    questionCount: value.questionCount,
    aiTurnCount: value.aiTurnCount,
    activitySequence: value.activitySequence,
    memoryNextStep: value.memoryNextStep,
    currentActor: value.currentActor,
    studentMatchCount: value.studentMatchCount,
    aiMatchCount: value.aiMatchCount,
    missCount: value.missCount,
    pairs,
    qCards,
    aCards,
    takenIds,
    revealedIds,
    seenCardIds,
    ...(pendingMiss ? { pendingMiss } : {}),
    ...(result ? { result } : {}),
  };
}

function sameIds(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    actual.every((id) => expected.includes(id));
}

export function ensureMemoryProgress(
  state: MemoryRunState,
  mode: QuestionGameRunMode,
  runVersion: number,
  activeRun = true,
) {
  const cards = memoryAllCards(state);
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const allCardIds = cards.map(({ id }) => id);
  const taken = new Set(state.takenIds);
  const revealed = new Set(state.revealedIds);
  const seen = new Set(state.seenCardIds);
  const settled = state.result !== undefined;
  const expectedRunVersion = state.activitySequence + 1 +
    (!activeRun && !settled ? 1 : 0);
  const takenPairs = state.pairs.filter(({ pairKey }) => {
    const question = state.qCards.find((card) => card.pairKey === pairKey);
    const answer = state.aCards.find((card) => card.pairKey === pairKey);
    if (!question || !answer) damaged();
    const questionTaken = taken.has(question.id);
    const answerTaken = taken.has(answer.id);
    if (questionTaken !== answerTaken) damaged();
    return questionTaken;
  }).length;
  const pendingMissCount = state.pendingMiss ? 1 : 0;
  const resolvedMissCount = state.missCount - pendingMissCount;
  const studentAttemptCount = state.questionCount - state.aiTurnCount;
  const partialStudentFlip = state.memoryNextStep === "STUDENT_ANSWER" ? 1 : 0;
  const expectedActivitySequence =
    studentAttemptCount * 2 +
    state.aiTurnCount +
    resolvedMissCount +
    partialStudentFlip;
  const expectedActor = mode === "AI" && resolvedMissCount % 2 === 1
    ? "AI"
    : "STUDENT";
  const allPairsTaken = takenPairs === state.pairs.length;
  const reachedAttemptLimit = state.questionCount === state.targetCount;
  const complete = state.memoryNextStep === "COMPLETE";
  const shouldBeComplete = allPairsTaken ||
    (reachedAttemptLimit && state.pendingMiss === undefined);

  if (
    runVersion !== expectedRunVersion ||
    state.activitySequence !== expectedActivitySequence ||
    state.aiTurnCount > state.questionCount ||
    studentAttemptCount < 0 ||
    state.studentMatchCount > studentAttemptCount ||
    state.aiMatchCount > state.aiTurnCount ||
    state.studentMatchCount + state.aiMatchCount !== takenPairs ||
    state.questionCount !== takenPairs + state.missCount ||
    resolvedMissCount < 0 ||
    state.currentActor !== expectedActor ||
    (mode === "SOLO" && (
      state.currentActor !== "STUDENT" ||
      state.aiTurnCount !== 0 ||
      state.aiMatchCount !== 0 ||
      state.memoryNextStep === "AI_TURN"
    )) ||
    state.takenIds.some((id) => !cardById.has(id)) ||
    state.revealedIds.some((id) => !cardById.has(id) || taken.has(id)) ||
    state.seenCardIds.some((id) => !cardById.has(id)) ||
    state.takenIds.some((id) => !seen.has(id)) ||
    state.revealedIds.some((id) => !seen.has(id)) ||
    (state.pendingMiss !== undefined) !==
      (state.memoryNextStep === "RESOLVE_MISS") ||
    (state.pendingMiss !== undefined && state.pendingMiss.actor !== state.currentActor) ||
    (complete !== shouldBeComplete) ||
    (settled && !complete) ||
    (activeRun && settled)
  ) damaged();

  if (complete) {
    const remainingIds = allCardIds.filter((id) => !taken.has(id));
    if (
      state.pendingMiss ||
      !sameIds(state.revealedIds, remainingIds) ||
      remainingIds.some((id) => !seen.has(id))
    ) damaged();
    return;
  }
  if (state.memoryNextStep === "RESOLVE_MISS") {
    if (state.revealedIds.length !== 2) damaged();
    const question = cardById.get(state.revealedIds[0]);
    const answer = cardById.get(state.revealedIds[1]);
    if (
      question?.type !== "q" ||
      answer?.type !== "a" ||
      question.pairKey === answer.pairKey
    ) damaged();
    return;
  }
  if (state.memoryNextStep === "STUDENT_ANSWER") {
    if (
      state.currentActor !== "STUDENT" ||
      state.revealedIds.length !== 1 ||
      cardById.get(state.revealedIds[0])?.type !== "q"
    ) damaged();
    return;
  }
  if (state.revealedIds.length !== 0) damaged();
  if (
    (state.currentActor === "STUDENT" &&
      state.memoryNextStep !== "STUDENT_QUESTION") ||
    (state.currentActor === "AI" && state.memoryNextStep !== "AI_TURN")
  ) damaged();
}

function shuffleWithIndex<T>(values: readonly T[], randomIndex: RandomIndex): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    if (!Number.isSafeInteger(swapIndex) || swapIndex < 0 || swapIndex > index) {
      throw new QuestionGameRunError("카드 짝 찾기 자료를 준비할 수 없습니다", 500);
    }
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function createMemoryState(
  input: QuestionGameRunCreateStateInput,
  randomIndex: RandomIndex = secureRandomIndex,
  randomId: RandomId = randomUUID,
): MemoryRunState {
  if (!isDifficulty(input.difficulty)) {
    throw new QuestionGameRunError("카드 짝 찾기 난이도가 올바르지 않습니다", 400);
  }
  if (
    MEMORY_FALLBACK_PAIRS.length !== 20 ||
    MEMORY_FALLBACK_PAIRS_EN.length !== MEMORY_FALLBACK_PAIRS.length
  ) {
    throw new QuestionGameRunError("카드 짝 찾기 고정 자료가 손상되었습니다", 500);
  }
  const difficulty = input.difficulty;
  const pairCount = MEMORY_DIFFICULTY[difficulty].pairs;
  const selectedKeys = shuffleWithIndex(CONTENT_KEYS, randomIndex).slice(0, pairCount);
  const usedIds = new Set<string>();
  const nextId = () => {
    const id = randomId();
    if (!QUESTION_GAME_REQUEST_ID_PATTERN.test(id) || usedIds.has(id)) {
      throw new QuestionGameRunError("카드 짝 찾기 식별값을 준비할 수 없습니다", 500);
    }
    usedIds.add(id);
    return id;
  };
  const pairs = selectedKeys.map((contentKey) => ({
    pairKey: nextId(),
    contentKey,
  }));
  const qCards = shuffleWithIndex(pairs.map(({ pairKey }) => ({
    id: nextId(),
    pairKey,
    type: "q" as const,
  })), randomIndex);
  const aCards = shuffleWithIndex(pairs.map(({ pairKey }) => ({
    id: nextId(),
    pairKey,
    type: "a" as const,
  })), randomIndex);
  return {
    game: "memory",
    locale: input.locale,
    difficulty,
    targetCount: QUESTION_GAME_RULES.memory.targets.solo[difficulty],
    questionCount: 0,
    aiTurnCount: 0,
    activitySequence: 0,
    memoryNextStep: "STUDENT_QUESTION",
    currentActor: "STUDENT",
    studentMatchCount: 0,
    aiMatchCount: 0,
    missCount: 0,
    pairs,
    qCards,
    aCards,
    takenIds: [],
    revealedIds: [],
    seenCardIds: [],
  };
}

function memoryState(value: unknown): MemoryRunState {
  return parseMemoryState(value as Prisma.JsonValue);
}

function publicCards<T extends "q" | "a">(state: MemoryRunState, type: T) {
  const cards = type === "q" ? state.qCards : state.aCards;
  const taken = new Set(state.takenIds);
  const revealed = new Set(state.revealedIds);
  return cards.map((card) => {
    const cardState = taken.has(card.id)
      ? "TAKEN" as const
      : revealed.has(card.id)
        ? "REVEALED" as const
        : "HIDDEN" as const;
    return {
      id: card.id,
      type,
      state: cardState,
      ...(cardState === "HIDDEN"
        ? {}
        : { contentKey: memoryContentKeyForCard(state, card.id) }),
    };
  });
}

export const memoryRunDefinition: QuestionGameRunDefinition = {
  gameId: "memory",
  createState: createMemoryState,
  parseState: parseMemoryState,
  ensureProgress(state: unknown, context: QuestionGameRunProgressContext) {
    ensureMemoryProgress(
      memoryState(state),
      context.mode,
      context.runVersion,
      context.activeRun,
    );
  },
  publicProgress(state: unknown, mode: QuestionGameRunMode) {
    const memory = memoryState(state);
    return {
      questionCount: memory.questionCount,
      aiTurnCount: memory.aiTurnCount,
      awaitingAiTurn: mode === "AI" && memory.memoryNextStep === "AI_TURN",
      targetCount: memory.targetCount,
      memoryNextStep: memory.memoryNextStep,
      memoryDifficulty: memory.difficulty,
      studentMatchCount: memory.studentMatchCount,
      aiMatchCount: memory.aiMatchCount,
      memoryQuestionCards: publicCards(memory, "q"),
      memoryAnswerCards: publicCards(memory, "a"),
      memoryMissReveal: memory.pendingMiss
        ? { ...memory.pendingMiss }
        : null,
      memoryReview: memory.memoryNextStep === "COMPLETE"
        ? memory.pairs.map(({ contentKey }) => ({ contentKey }))
        : null,
    };
  },
  clearTransientState(state: unknown) {
    return memoryState(state);
  },
  result(state: unknown) {
    return memoryState(state).result;
  },
};
