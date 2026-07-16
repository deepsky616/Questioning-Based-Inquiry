"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LadderGrid } from "@/lib/question-ladder";

export interface GameRunSnapshot {
  id: string;
  gameId?: string;
  mode?: string;
  status?: string;
  version: number;
  targetCount: number;
  questionCount: number;
  aiTurnCount: number;
  awaitingAiTurn: boolean;
  preview: boolean;
  nextStep?: DiceRunNextStep;
  pendingRoll?: DicePendingRoll | null;
  ladderRound?: number | null;
  ladderGrid?: LadderGrid | null;
  correctCount?: number;
  currentSentence?: string | null;
  kabaNextStep?: "STUDENT_ATTEMPT" | "COMPLETE";
  storyDiceNextStep?: StoryDiceRunNextStep;
  storyWordPool?: StoryDiceWordPool;
  storyRolledWords?: StoryDiceRolledWords | null;
  memoryDifficulty?: MemoryRunDifficulty;
  memoryNextStep?: MemoryRunNextStep;
  studentMatchCount?: number;
  aiMatchCount?: number;
  memoryQuestionCards?: MemoryRunCard[];
  memoryAnswerCards?: MemoryRunCard[];
  memoryMissReveal?: MemoryMissReveal | null;
  memoryReview?: MemoryReviewEntry[] | null;
}

export type MemoryRunDifficulty = "easy" | "normal" | "hard";

export type MemoryRunNextStep =
  | "STUDENT_QUESTION"
  | "STUDENT_ANSWER"
  | "AI_TURN"
  | "RESOLVE_MISS"
  | "COMPLETE";

export interface MemoryRunCard {
  id: string;
  type: "q" | "a";
  state: "HIDDEN" | "REVEALED" | "TAKEN";
  contentKey?: string;
}

export interface MemoryMissReveal {
  id: string;
  actor: "STUDENT" | "AI";
  result: "MISS";
  resolveAt: number;
}

export interface MemoryReviewEntry {
  contentKey: string;
}

export type StoryDiceRunNextStep =
  | "ROLL"
  | "STORY"
  | "STUDENT_QUESTION"
  | "AI_QUESTION"
  | "STUDENT_ANSWER"
  | "COMPLETE";

export interface StoryDiceWordPool {
  protagonist: string[];
  place: string[];
  event: string[];
}

export interface StoryDiceRolledWords {
  protagonist: string;
  place: string;
  event: string;
}

export type DiceRunNextStep =
  | "STUDENT_ROLL"
  | "STUDENT_QUESTION"
  | "AI_ROLL"
  | "AI_QUESTION"
  | "COMPLETE";

export interface DicePendingRoll {
  actor: "STUDENT" | "AI";
  face: number;
}

export interface GameRunResult {
  awarded: number;
  dailyLimit: number;
  dailyRemaining: number;
  cappedByLimit: boolean;
  preview: boolean;
  alreadySettled?: boolean;
}

export interface SubmittedRelayQuestion {
  run: GameRunSnapshot;
  result: GameRunResult | null;
}

export type SubmittedDiceQuestion = SubmittedRelayQuestion;

export interface SubmittedKabaAttempt extends SubmittedRelayQuestion {
  correct: boolean;
}

export type SubmittedStoryDiceAction = SubmittedRelayQuestion;

export type SubmittedMemoryAction = SubmittedRelayQuestion;

type PendingKind = "create" | "action" | "ai" | "complete" | null;

interface RetriableRequest {
  key: string;
  requestId: string;
}

interface RetriableActionRequest extends RetriableRequest {
  question: string;
}

interface IssuedQuestionGameAiTurn {
  output: string;
  proof: string;
  runVersion: number;
  expiresAt: string;
}

interface RetriableAiRecordRequest extends RetriableRequest {
  generationRequestId: string;
  issued: IssuedQuestionGameAiTurn;
}

export type UnconfirmedMemoryAction =
  | { action: "memory-flip-card"; cardId: string }
  | { action: "memory-ai-turn" }
  | { action: "memory-resolve-miss"; revealId: string };

export interface GameRunStartOptions {
  difficulty?: MemoryRunDifficulty;
}

export interface RecordedRelayAiTurn {
  run: GameRunSnapshot;
  output: string;
}

export type RecordedDiceAiTurn = RecordedRelayAiTurn;

const RUN_CONFLICT_MESSAGE =
  "질문놀이 상태가 다른 화면에서 변경되었습니다. 새 실행으로 다시 시작해 주세요.";

class QuestionGameRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly aiProofRejected: boolean,
  ) {
    super(message);
    this.name = "QuestionGameRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MEMORY_CONTENT_KEY_PATTERN = /^memory-pair-(0[1-9]|1[0-9]|20)$/;
const MEMORY_RUN_CONFIG: Record<
  MemoryRunDifficulty,
  { pairCount: number; targetCount: number }
> = {
  easy: { pairCount: 6, targetCount: 18 },
  normal: { pairCount: 10, targetCount: 30 },
  hard: { pairCount: 15, targetCount: 45 },
};

function readMemoryCards(
  value: unknown,
  type: "q" | "a",
  expectedCount: number,
): MemoryRunCard[] | null {
  if (!Array.isArray(value) || value.length !== expectedCount) return null;
  const cards: MemoryRunCard[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      item.id !== item.id.trim() ||
      [...item.id].length > 128 ||
      item.type !== type ||
      (item.state !== "HIDDEN" && item.state !== "REVEALED" && item.state !== "TAKEN")
    ) return null;
    if (item.state === "HIDDEN") {
      if (item.contentKey !== undefined) return null;
      cards.push({ id: item.id, type, state: "HIDDEN" });
      continue;
    }
    if (
      typeof item.contentKey !== "string" ||
      !MEMORY_CONTENT_KEY_PATTERN.test(item.contentKey)
    ) return null;
    cards.push({
      id: item.id,
      type,
      state: item.state,
      contentKey: item.contentKey,
    });
  }
  if (new Set(cards.map((card) => card.id)).size !== cards.length) return null;
  const visibleKeys = cards.flatMap((card) => card.contentKey ? [card.contentKey] : []);
  if (new Set(visibleKeys).size !== visibleKeys.length) return null;
  return cards;
}

function readMemoryReview(value: unknown, expectedCount: number): MemoryReviewEntry[] | null {
  if (!Array.isArray(value) || value.length !== expectedCount) return null;
  const review: MemoryReviewEntry[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.contentKey !== "string" ||
      !MEMORY_CONTENT_KEY_PATTERN.test(item.contentKey)
    ) return null;
    review.push({ contentKey: item.contentKey });
  }
  return new Set(review.map((item) => item.contentKey)).size === review.length
    ? review
    : null;
}

function readRun(value: unknown): GameRunSnapshot | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    typeof value.targetCount !== "number" ||
    !Number.isSafeInteger(value.targetCount) ||
    value.targetCount < 1 ||
    typeof value.questionCount !== "number" ||
    !Number.isSafeInteger(value.questionCount) ||
    value.questionCount < 0 ||
    value.questionCount > value.targetCount ||
    typeof value.aiTurnCount !== "number" ||
    !Number.isSafeInteger(value.aiTurnCount) ||
    value.aiTurnCount < 0 ||
    value.aiTurnCount > value.targetCount ||
    (value.gameId !== "story-dice" &&
      value.gameId !== "memory" &&
      value.aiTurnCount >= value.targetCount) ||
    typeof value.awaitingAiTurn !== "boolean" ||
    typeof value.preview !== "boolean"
  ) return null;
  let nextStep: DiceRunNextStep | undefined;
  let pendingRoll: DicePendingRoll | null | undefined;
  let ladderRound: number | null | undefined;
  let ladderGrid: LadderGrid | null | undefined;
  let correctCount: number | undefined;
  let currentSentence: string | null | undefined;
  let kabaNextStep: "STUDENT_ATTEMPT" | "COMPLETE" | undefined;
  let storyDiceNextStep: StoryDiceRunNextStep | undefined;
  let storyWordPool: StoryDiceWordPool | undefined;
  let storyRolledWords: StoryDiceRolledWords | null | undefined;
  let memoryDifficulty: MemoryRunDifficulty | undefined;
  let memoryNextStep: MemoryRunNextStep | undefined;
  let studentMatchCount: number | undefined;
  let aiMatchCount: number | undefined;
  let memoryQuestionCards: MemoryRunCard[] | undefined;
  let memoryAnswerCards: MemoryRunCard[] | undefined;
  let memoryMissReveal: MemoryMissReveal | null | undefined;
  let memoryReview: MemoryReviewEntry[] | null | undefined;
  if (value.gameId === "memory") {
    const difficulty = value.memoryDifficulty;
    const nextStep = value.memoryNextStep;
    const active = value.status === "ACTIVE";
    if (
      (value.mode !== "SOLO" && value.mode !== "AI") ||
      (value.status !== "ACTIVE" && value.status !== "SETTLED") ||
      (difficulty !== "easy" && difficulty !== "normal" && difficulty !== "hard") ||
      (nextStep !== "STUDENT_QUESTION" &&
        nextStep !== "STUDENT_ANSWER" &&
        nextStep !== "AI_TURN" &&
        nextStep !== "RESOLVE_MISS" &&
        nextStep !== "COMPLETE")
    ) return null;
    const config = MEMORY_RUN_CONFIG[difficulty];
    if (value.targetCount !== config.targetCount) return null;
    const questionCards = readMemoryCards(
      value.memoryQuestionCards,
      "q",
      config.pairCount,
    );
    const answerCards = readMemoryCards(
      value.memoryAnswerCards,
      "a",
      config.pairCount,
    );
    if (!questionCards || !answerCards) return null;
    const allCardIds = [...questionCards, ...answerCards].map((card) => card.id);
    if (new Set(allCardIds).size !== allCardIds.length) return null;
    if (
      typeof value.studentMatchCount !== "number" ||
      !Number.isSafeInteger(value.studentMatchCount) ||
      value.studentMatchCount < 0 ||
      typeof value.aiMatchCount !== "number" ||
      !Number.isSafeInteger(value.aiMatchCount) ||
      value.aiMatchCount < 0
    ) return null;
    const takenQuestionKeys = questionCards.flatMap((card) =>
      card.state === "TAKEN" && card.contentKey ? [card.contentKey] : []);
    const takenAnswerKeys = answerCards.flatMap((card) =>
      card.state === "TAKEN" && card.contentKey ? [card.contentKey] : []);
    const revealedQuestions = questionCards.filter((card) => card.state === "REVEALED");
    const revealedAnswers = answerCards.filter((card) => card.state === "REVEALED");
    const totalMatchCount = value.studentMatchCount + value.aiMatchCount;
    if (
      takenQuestionKeys.length !== totalMatchCount ||
      takenAnswerKeys.length !== totalMatchCount ||
      JSON.stringify([...takenQuestionKeys].sort()) !==
        JSON.stringify([...takenAnswerKeys].sort()) ||
      totalMatchCount > config.pairCount ||
      value.aiTurnCount > value.questionCount ||
      value.studentMatchCount > value.questionCount - value.aiTurnCount ||
      value.aiMatchCount > value.aiTurnCount ||
      (value.mode === "SOLO" && (value.aiTurnCount !== 0 || value.aiMatchCount !== 0))
    ) return null;
    if (nextStep === "STUDENT_ANSWER") {
      if (revealedQuestions.length !== 1 || revealedAnswers.length !== 0) return null;
    } else if (nextStep === "RESOLVE_MISS") {
      if (
        revealedQuestions.length !== 1 ||
        revealedAnswers.length !== 1 ||
        revealedQuestions[0].contentKey === revealedAnswers[0].contentKey
      ) return null;
    } else if (nextStep === "COMPLETE") {
      const revealedQuestionKeys = revealedQuestions.flatMap((card) =>
        card.contentKey ? [card.contentKey] : []);
      const revealedAnswerKeys = revealedAnswers.flatMap((card) =>
        card.contentKey ? [card.contentKey] : []);
      if (
        questionCards.some((card) => card.state === "HIDDEN") ||
        answerCards.some((card) => card.state === "HIDDEN") ||
        revealedQuestions.length !== config.pairCount - totalMatchCount ||
        revealedAnswers.length !== config.pairCount - totalMatchCount ||
        JSON.stringify([...revealedQuestionKeys].sort()) !==
          JSON.stringify([...revealedAnswerKeys].sort())
      ) return null;
    } else if (revealedQuestions.length !== 0 || revealedAnswers.length !== 0) {
      return null;
    }
    let missReveal: MemoryMissReveal | null;
    if (value.memoryMissReveal === null) {
      missReveal = null;
    } else if (
      isRecord(value.memoryMissReveal) &&
      typeof value.memoryMissReveal.id === "string" &&
      value.memoryMissReveal.id !== "" &&
      value.memoryMissReveal.id === value.memoryMissReveal.id.trim() &&
      [...value.memoryMissReveal.id].length <= 128 &&
      (value.memoryMissReveal.actor === "STUDENT" || value.memoryMissReveal.actor === "AI") &&
      value.memoryMissReveal.result === "MISS" &&
      typeof value.memoryMissReveal.resolveAt === "number" &&
      Number.isSafeInteger(value.memoryMissReveal.resolveAt) &&
      value.memoryMissReveal.resolveAt > 0
    ) {
      missReveal = {
        id: value.memoryMissReveal.id,
        actor: value.memoryMissReveal.actor,
        result: "MISS",
        resolveAt: value.memoryMissReveal.resolveAt,
      };
    } else {
      return null;
    }
    const pendingMissCount = missReveal ? 1 : 0;
    const resolvedMissCount = value.questionCount - totalMatchCount - pendingMissCount;
    const partialStudentFlip = nextStep === "STUDENT_ANSWER" ? 1 : 0;
    const expectedVersion = 1 +
      (value.questionCount - value.aiTurnCount) * 2 +
      value.aiTurnCount +
      resolvedMissCount +
      partialStudentFlip;
    const expectedActor = value.mode === "AI" && resolvedMissCount % 2 === 1
      ? "AI"
      : "STUDENT";
    if (
      resolvedMissCount < 0 ||
      value.version !== expectedVersion ||
      (nextStep === "RESOLVE_MISS") !== (missReveal !== null) ||
      (missReveal !== null && missReveal.actor !== expectedActor) ||
      value.awaitingAiTurn !== (nextStep === "AI_TURN") ||
      (nextStep === "STUDENT_QUESTION" && expectedActor !== "STUDENT") ||
      (nextStep === "STUDENT_ANSWER" && expectedActor !== "STUDENT") ||
      (nextStep === "AI_TURN" && expectedActor !== "AI") ||
      (nextStep === "COMPLETE") !== !active ||
      (active && totalMatchCount >= config.pairCount) ||
      (active && value.questionCount === value.targetCount && nextStep !== "RESOLVE_MISS") ||
      (!active && value.questionCount !== value.targetCount && totalMatchCount !== config.pairCount)
    ) return null;
    if (!Object.prototype.hasOwnProperty.call(value, "memoryReview")) return null;
    const review = active
      ? value.memoryReview === null
        ? null
        : undefined
      : readMemoryReview(value.memoryReview, config.pairCount);
    if (review === undefined || (!active && review === null)) return null;
    if (review) {
      const reviewKeys = new Set(review.map((item) => item.contentKey));
      const visibleQuestionKeys = questionCards.flatMap((card) =>
        card.contentKey ? [card.contentKey] : []);
      if (
        takenQuestionKeys.some((key) => !reviewKeys.has(key)) ||
        takenAnswerKeys.some((key) => !reviewKeys.has(key)) ||
        visibleQuestionKeys.length !== config.pairCount ||
        visibleQuestionKeys.some((key) => !reviewKeys.has(key))
      ) return null;
    }
    memoryDifficulty = difficulty;
    memoryNextStep = nextStep;
    studentMatchCount = value.studentMatchCount;
    aiMatchCount = value.aiMatchCount;
    memoryQuestionCards = questionCards;
    memoryAnswerCards = answerCards;
    memoryMissReveal = missReveal;
    memoryReview = review;
  } else if (value.gameId === "dice") {
    if (
      (value.mode !== "SOLO" && value.mode !== "AI") ||
      (value.status !== "ACTIVE" && value.status !== "SETTLED") ||
      value.nextStep !== "STUDENT_ROLL" &&
      value.nextStep !== "STUDENT_QUESTION" &&
      value.nextStep !== "AI_ROLL" &&
      value.nextStep !== "AI_QUESTION" &&
      value.nextStep !== "COMPLETE"
    ) return null;
    nextStep = value.nextStep;
    if (value.pendingRoll === null || value.pendingRoll === undefined) {
      pendingRoll = null;
    } else {
      if (
        !isRecord(value.pendingRoll) ||
        (value.pendingRoll.actor !== "STUDENT" && value.pendingRoll.actor !== "AI") ||
        typeof value.pendingRoll.face !== "number" ||
        !Number.isSafeInteger(value.pendingRoll.face) ||
        value.pendingRoll.face < 1 ||
        value.pendingRoll.face > 6
      ) return null;
      pendingRoll = {
        actor: value.pendingRoll.actor,
        face: value.pendingRoll.face,
      };
    }
    const expectedPendingActor = nextStep === "STUDENT_QUESTION"
      ? "STUDENT"
      : nextStep === "AI_QUESTION"
        ? "AI"
        : null;
    const hasPendingRoll = pendingRoll !== null;
    let expectedNextStep: DiceRunNextStep;
    if (value.mode === "SOLO") {
      if (value.aiTurnCount !== 0) return null;
      expectedNextStep = value.questionCount === value.targetCount
        ? "COMPLETE"
        : hasPendingRoll
          ? "STUDENT_QUESTION"
          : "STUDENT_ROLL";
    } else if (
      value.questionCount === value.targetCount &&
      value.aiTurnCount === value.targetCount - 1
    ) {
      expectedNextStep = "COMPLETE";
    } else if (value.questionCount === value.aiTurnCount) {
      expectedNextStep = hasPendingRoll ? "STUDENT_QUESTION" : "STUDENT_ROLL";
    } else if (
      value.questionCount === value.aiTurnCount + 1 &&
      value.questionCount < value.targetCount
    ) {
      expectedNextStep = hasPendingRoll ? "AI_QUESTION" : "AI_ROLL";
    } else {
      return null;
    }
    if (
      nextStep !== expectedNextStep ||
      (nextStep === "COMPLETE") !== (value.status === "SETTLED") ||
      value.awaitingAiTurn !== (nextStep === "AI_QUESTION") ||
      ((nextStep === "AI_ROLL" || nextStep === "AI_QUESTION") && value.mode !== "AI") ||
      (expectedPendingActor === null && pendingRoll !== null) ||
      (expectedPendingActor !== null && pendingRoll?.actor !== expectedPendingActor)
    ) return null;
  } else if (value.gameId === "ladder") {
    const columnCount = value.mode === "AI" ? 2 : value.mode === "SOLO" ? 4 : 0;
    const active = value.status === "ACTIVE";
    if (
      columnCount === 0 ||
      (value.status !== "ACTIVE" && value.status !== "SETTLED") ||
      value.targetCount !== 3 ||
      value.aiTurnCount !== 0 ||
      value.awaitingAiTurn ||
      active !== (value.questionCount < value.targetCount)
    ) return null;
    if (active) {
      if (
        value.ladderRound !== value.questionCount + 1 ||
        !Array.isArray(value.ladderGrid) ||
        value.ladderGrid.length !== 10 ||
        value.ladderGrid.some((row) =>
          !Array.isArray(row) ||
          row.length !== columnCount - 1 ||
          row.some((rung) => typeof rung !== "boolean") ||
          row.some((rung, index) => rung && row[index + 1] === true)
        )
      ) return null;
      ladderRound = value.ladderRound;
      ladderGrid = value.ladderGrid as boolean[][];
    } else {
      if (value.ladderRound !== null || value.ladderGrid !== null) return null;
      ladderRound = null;
      ladderGrid = null;
    }
  } else if (value.gameId === "kaba") {
    const active = value.status === "ACTIVE";
    if (
      (value.mode !== "SOLO" && value.mode !== "AI") ||
      (value.status !== "ACTIVE" && value.status !== "SETTLED") ||
      value.targetCount !== 10 ||
      value.aiTurnCount !== 0 ||
      value.awaitingAiTurn ||
      typeof value.correctCount !== "number" ||
      !Number.isSafeInteger(value.correctCount) ||
      value.correctCount < 0 ||
      value.correctCount > value.questionCount ||
      active !== (value.questionCount < value.targetCount) ||
      value.kabaNextStep !== (active ? "STUDENT_ATTEMPT" : "COMPLETE")
    ) return null;
    if (active) {
      if (
        typeof value.currentSentence !== "string" ||
        !value.currentSentence.trim() ||
        [...value.currentSentence].length > 200
      ) return null;
      currentSentence = value.currentSentence;
    } else {
      if (value.currentSentence !== null) return null;
      currentSentence = null;
    }
    correctCount = value.correctCount;
    kabaNextStep = value.kabaNextStep as "STUDENT_ATTEMPT" | "COMPLETE";
  } else if (value.gameId === "story-dice") {
    const nextStep = value.storyDiceNextStep;
    const active = value.status === "ACTIVE";
    if (
      (value.mode !== "SOLO" && value.mode !== "AI") ||
      (value.status !== "ACTIVE" && value.status !== "SETTLED") ||
      value.targetCount !== 3 ||
      nextStep !== "ROLL" &&
      nextStep !== "STORY" &&
      nextStep !== "STUDENT_QUESTION" &&
      nextStep !== "AI_QUESTION" &&
      nextStep !== "STUDENT_ANSWER" &&
      nextStep !== "COMPLETE"
    ) return null;
    const readWords = (input: unknown, exactLength?: number): string[] | null => {
      if (
        !Array.isArray(input) ||
        (exactLength !== undefined && input.length !== exactLength) ||
        input.some((word) =>
          typeof word !== "string" ||
          !word.trim() ||
          word !== word.trim() ||
          [...word].length > 60
        ) ||
        new Set(input).size !== input.length
      ) return null;
      return [...input] as string[];
    };
    if (!isRecord(value.storyWordPool)) return null;
    const protagonist = readWords(value.storyWordPool.protagonist, 8);
    const place = readWords(value.storyWordPool.place, 8);
    const event = readWords(value.storyWordPool.event, 8);
    if (!protagonist || !place || !event) return null;
    storyWordPool = { protagonist, place, event };
    if (value.storyRolledWords === null) {
      storyRolledWords = null;
    } else if (
      isRecord(value.storyRolledWords) &&
      typeof value.storyRolledWords.protagonist === "string" &&
      protagonist.includes(value.storyRolledWords.protagonist) &&
      typeof value.storyRolledWords.place === "string" &&
      place.includes(value.storyRolledWords.place) &&
      typeof value.storyRolledWords.event === "string" &&
      event.includes(value.storyRolledWords.event)
    ) {
      storyRolledWords = {
        protagonist: value.storyRolledWords.protagonist,
        place: value.storyRolledWords.place,
        event: value.storyRolledWords.event,
      };
    } else {
      return null;
    }
    const expectedVersion = nextStep === "ROLL"
      ? 1
      : nextStep === "STORY"
        ? 2
        : 3 + value.questionCount * 2 + (nextStep === "STUDENT_ANSWER" ? 1 : 0);
    const expectedAiTurnCount = value.mode === "AI"
      ? value.questionCount + (nextStep === "STUDENT_ANSWER" ? 1 : 0)
      : 0;
    if (
      value.version !== expectedVersion ||
      (nextStep === "ROLL") !== (storyRolledWords === null) ||
      (nextStep === "COMPLETE") !== !active ||
      value.aiTurnCount !== expectedAiTurnCount ||
      value.awaitingAiTurn !== (nextStep === "AI_QUESTION") ||
      (value.mode === "SOLO" && nextStep === "AI_QUESTION") ||
      (value.mode === "AI" && nextStep === "STUDENT_QUESTION") ||
      ((nextStep === "ROLL" || nextStep === "STORY") && value.questionCount !== 0) ||
      (nextStep === "COMPLETE" && value.questionCount !== value.targetCount)
    ) return null;
    storyDiceNextStep = nextStep;
  }
  return {
    id: value.id,
    ...(typeof value.gameId === "string" ? { gameId: value.gameId } : {}),
    ...(typeof value.mode === "string" ? { mode: value.mode } : {}),
    ...(typeof value.status === "string" ? { status: value.status } : {}),
    version: value.version,
    targetCount: value.targetCount,
    questionCount: value.questionCount,
    aiTurnCount: value.aiTurnCount,
    awaitingAiTurn: value.awaitingAiTurn,
    preview: value.preview,
    ...(nextStep ? { nextStep } : {}),
    ...(pendingRoll !== undefined ? { pendingRoll } : {}),
    ...(ladderRound !== undefined ? { ladderRound } : {}),
    ...(ladderGrid !== undefined ? { ladderGrid } : {}),
    ...(correctCount !== undefined ? { correctCount } : {}),
    ...(currentSentence !== undefined ? { currentSentence } : {}),
    ...(kabaNextStep !== undefined ? { kabaNextStep } : {}),
    ...(storyDiceNextStep !== undefined ? { storyDiceNextStep } : {}),
    ...(storyWordPool !== undefined ? { storyWordPool } : {}),
    ...(storyRolledWords !== undefined ? { storyRolledWords } : {}),
    ...(memoryDifficulty !== undefined ? { memoryDifficulty } : {}),
    ...(memoryNextStep !== undefined ? { memoryNextStep } : {}),
    ...(studentMatchCount !== undefined ? { studentMatchCount } : {}),
    ...(aiMatchCount !== undefined ? { aiMatchCount } : {}),
    ...(memoryQuestionCards !== undefined ? { memoryQuestionCards } : {}),
    ...(memoryAnswerCards !== undefined ? { memoryAnswerCards } : {}),
    ...(memoryMissReveal !== undefined ? { memoryMissReveal } : {}),
    ...(memoryReview !== undefined ? { memoryReview } : {}),
  };
}

function readIssuedQuestionGameAiTurn(value: unknown): IssuedQuestionGameAiTurn | null {
  if (!isRecord(value)) return null;
  const expiresAtMs = typeof value.expiresAt === "string"
    ? Date.parse(value.expiresAt)
    : Number.NaN;
  if (
    typeof value.output !== "string" ||
    !value.output.trim() ||
    typeof value.proof !== "string" ||
    !value.proof ||
    typeof value.runVersion !== "number" ||
    !Number.isSafeInteger(value.runVersion) ||
    value.runVersion < 1 ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(expiresAtMs) ||
    new Date(expiresAtMs).toISOString() !== value.expiresAt
  ) return null;
  return {
    output: value.output.trim(),
    proof: value.proof,
    runVersion: value.runVersion,
    expiresAt: value.expiresAt,
  };
}

function readResult(value: unknown): GameRunResult | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.awarded !== "number" ||
    !Number.isSafeInteger(value.awarded) ||
    value.awarded < 0 ||
    typeof value.dailyLimit !== "number" ||
    !Number.isSafeInteger(value.dailyLimit) ||
    value.dailyLimit < 0 ||
    typeof value.dailyRemaining !== "number" ||
    !Number.isSafeInteger(value.dailyRemaining) ||
    value.dailyRemaining < 0 ||
    value.awarded > value.dailyLimit ||
    value.dailyRemaining > value.dailyLimit ||
    value.awarded + value.dailyRemaining > value.dailyLimit ||
    typeof value.cappedByLimit !== "boolean" ||
    typeof value.preview !== "boolean" ||
    (value.alreadySettled !== undefined && typeof value.alreadySettled !== "boolean")
  ) return null;
  return {
    awarded: value.awarded,
    dailyLimit: value.dailyLimit,
    dailyRemaining: value.dailyRemaining,
    cappedByLimit: value.cappedByLimit,
    preview: value.preview,
    ...(typeof value.alreadySettled === "boolean"
      ? { alreadySettled: value.alreadySettled }
      : {}),
  };
}

function readSettlementResult(
  value: unknown,
  run: GameRunSnapshot,
): GameRunResult | null {
  if (run.status === "SETTLED") {
    const result = readResult(value);
    if (!result) throw new Error("포인트 지급 결과를 확인할 수 없습니다.");
    const expectedDailyLimit = run.mode === "SOLO" ? 30 : run.mode === "AI" ? 50 : null;
    if (
      result.preview !== run.preview ||
      (expectedDailyLimit !== null && result.dailyLimit !== expectedDailyLimit)
    ) {
      throw new Error("포인트 지급 결과가 질문놀이 실행과 일치하지 않습니다.");
    }
    return result;
  }
  if (value !== undefined && value !== null) {
    throw new Error("진행 중인 질문놀이의 지급 상태를 확인할 수 없습니다.");
  }
  return null;
}

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12);
  return `00000000-0000-4000-8000-${random}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(value) && typeof value.error === "string"
      ? value.error
      : "질문놀이 요청을 처리하지 못했습니다.";
    throw new QuestionGameRequestError(
      message,
      response.status,
      isRecord(value) && value.aiProofRejected === true,
    );
  }
  if (!isRecord(value)) throw new Error("질문놀이 응답을 확인할 수 없습니다.");
  return value;
}

async function readRunResult(runId: string) {
  const value = await readJson(await fetch(
    `/api/question-games/runs/${runId}/result`,
    { method: "GET" },
  ));
  const run = readRun(value.run);
  if (!run) throw new Error("질문놀이 실행 상태를 확인할 수 없습니다.");
  const result = readSettlementResult(value.result, run);
  return { run, result };
}

function requestErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isRejectedAiProof(error: unknown) {
  return error instanceof QuestionGameRequestError &&
    error.status === 409 &&
    error.aiProofRejected;
}

function isExplicitRequestRejection(error: unknown) {
  return error instanceof QuestionGameRequestError;
}

function isSameRunProgress(first: GameRunSnapshot, second: GameRunSnapshot) {
  return (
    first.id === second.id &&
    first.gameId === second.gameId &&
    first.mode === second.mode &&
    first.preview === second.preview &&
    first.version === second.version &&
    first.targetCount === second.targetCount &&
    first.questionCount === second.questionCount &&
    first.aiTurnCount === second.aiTurnCount &&
    first.awaitingAiTurn === second.awaitingAiTurn &&
    first.nextStep === second.nextStep &&
    first.pendingRoll?.actor === second.pendingRoll?.actor &&
    first.pendingRoll?.face === second.pendingRoll?.face &&
    first.ladderRound === second.ladderRound &&
    JSON.stringify(first.ladderGrid) === JSON.stringify(second.ladderGrid) &&
    first.correctCount === second.correctCount &&
    first.currentSentence === second.currentSentence &&
    first.kabaNextStep === second.kabaNextStep &&
    first.storyDiceNextStep === second.storyDiceNextStep &&
    JSON.stringify(first.storyWordPool) === JSON.stringify(second.storyWordPool) &&
    JSON.stringify(first.storyRolledWords) === JSON.stringify(second.storyRolledWords) &&
    first.memoryDifficulty === second.memoryDifficulty &&
    first.memoryNextStep === second.memoryNextStep &&
    first.studentMatchCount === second.studentMatchCount &&
    first.aiMatchCount === second.aiMatchCount &&
    JSON.stringify(first.memoryQuestionCards) === JSON.stringify(second.memoryQuestionCards) &&
    JSON.stringify(first.memoryAnswerCards) === JSON.stringify(second.memoryAnswerCards) &&
    JSON.stringify(first.memoryMissReveal) === JSON.stringify(second.memoryMissReveal) &&
    JSON.stringify(first.memoryReview) === JSON.stringify(second.memoryReview) &&
    first.status === second.status
  );
}

function isExpectedQuestionAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  return (
    next.id === current.id &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount + 1 &&
    next.aiTurnCount === current.aiTurnCount
  );
}

function isExpectedAiAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  return (
    next.id === current.id &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount &&
    next.aiTurnCount === current.aiTurnCount + 1 &&
    !next.awaitingAiTurn
  );
}

function isExpectedDiceRollAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  const expectedActor = current.nextStep === "AI_ROLL" ? "AI" : "STUDENT";
  const expectedNextStep = expectedActor === "AI" ? "AI_QUESTION" : "STUDENT_QUESTION";
  return (
    current.gameId === "dice" &&
    next.gameId === "dice" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.status === "ACTIVE" &&
    next.targetCount === current.targetCount &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount &&
    next.aiTurnCount === current.aiTurnCount &&
    next.nextStep === expectedNextStep &&
    next.pendingRoll?.actor === expectedActor &&
    next.awaitingAiTurn === (expectedActor === "AI")
  );
}

function isExpectedDiceQuestionAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  const completesRun = current.questionCount + 1 === current.targetCount;
  const expectedNextStep = completesRun
    ? "COMPLETE"
    : current.mode === "AI"
      ? "AI_ROLL"
      : "STUDENT_ROLL";
  return (
    current.gameId === "dice" &&
    next.gameId === "dice" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.status === (completesRun ? "SETTLED" : "ACTIVE") &&
    next.targetCount === current.targetCount &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount + 1 &&
    next.aiTurnCount === current.aiTurnCount &&
    next.nextStep === expectedNextStep &&
    !next.awaitingAiTurn &&
    next.pendingRoll == null
  );
}

function isExpectedDiceAiAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  return (
    current.gameId === "dice" &&
    next.gameId === "dice" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.status === "ACTIVE" &&
    next.targetCount === current.targetCount &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount &&
    next.aiTurnCount === current.aiTurnCount + 1 &&
    next.nextStep === "STUDENT_ROLL" &&
    !next.awaitingAiTurn &&
    next.pendingRoll == null
  );
}

function isExpectedLadderQuestionAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  const completesRun = current.questionCount + 1 === current.targetCount;
  return (
    current.gameId === "ladder" &&
    next.gameId === "ladder" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.status === (completesRun ? "SETTLED" : "ACTIVE") &&
    next.targetCount === current.targetCount &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount + 1 &&
    next.aiTurnCount === 0 &&
    !next.awaitingAiTurn &&
    next.ladderRound === (completesRun ? null : current.questionCount + 2) &&
    (completesRun ? next.ladderGrid === null : Array.isArray(next.ladderGrid))
  );
}

function isExpectedKabaAttemptAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
  correct: boolean,
) {
  const completesRun = current.questionCount + 1 === current.targetCount;
  return (
    current.gameId === "kaba" &&
    next.gameId === "kaba" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.status === (completesRun ? "SETTLED" : "ACTIVE") &&
    next.targetCount === current.targetCount &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount + 1 &&
    next.aiTurnCount === 0 &&
    next.correctCount === (current.correctCount ?? 0) + (correct ? 1 : 0) &&
    !next.awaitingAiTurn &&
    next.kabaNextStep === (completesRun ? "COMPLETE" : "STUDENT_ATTEMPT") &&
    (completesRun ? next.currentSentence === null : Boolean(next.currentSentence))
  );
}

function isExpectedStoryDiceRollAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  return (
    current.gameId === "story-dice" &&
    current.storyDiceNextStep === "ROLL" &&
    next.gameId === "story-dice" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.status === "ACTIVE" &&
    next.version === current.version + 1 &&
    next.questionCount === 0 &&
    next.aiTurnCount === 0 &&
    next.storyDiceNextStep === "STORY" &&
    next.storyRolledWords !== null &&
    next.storyRolledWords !== undefined &&
    !next.awaitingAiTurn
  );
}

function isExpectedStoryDiceStoryAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  const expectedNextStep = current.mode === "AI" ? "AI_QUESTION" : "STUDENT_QUESTION";
  return (
    current.gameId === "story-dice" &&
    current.storyDiceNextStep === "STORY" &&
    next.gameId === "story-dice" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.status === "ACTIVE" &&
    next.version === current.version + 1 &&
    next.questionCount === 0 &&
    next.aiTurnCount === 0 &&
    next.storyDiceNextStep === expectedNextStep &&
    next.awaitingAiTurn === (expectedNextStep === "AI_QUESTION")
  );
}

function isExpectedStoryDiceQuestionAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  return (
    current.gameId === "story-dice" &&
    current.mode === "SOLO" &&
    current.storyDiceNextStep === "STUDENT_QUESTION" &&
    next.gameId === "story-dice" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.status === "ACTIVE" &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount &&
    next.aiTurnCount === 0 &&
    next.storyDiceNextStep === "STUDENT_ANSWER" &&
    !next.awaitingAiTurn
  );
}

function isExpectedStoryDiceAiAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  return (
    current.gameId === "story-dice" &&
    current.mode === "AI" &&
    current.storyDiceNextStep === "AI_QUESTION" &&
    next.gameId === "story-dice" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.status === "ACTIVE" &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount &&
    next.aiTurnCount === current.aiTurnCount + 1 &&
    next.storyDiceNextStep === "STUDENT_ANSWER" &&
    !next.awaitingAiTurn
  );
}

function isExpectedStoryDiceAnswerAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  const completesRun = current.questionCount + 1 === current.targetCount;
  const expectedNextStep = completesRun
    ? "COMPLETE"
    : current.mode === "AI"
      ? "AI_QUESTION"
      : "STUDENT_QUESTION";
  return (
    current.gameId === "story-dice" &&
    current.storyDiceNextStep === "STUDENT_ANSWER" &&
    next.gameId === "story-dice" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.status === (completesRun ? "SETTLED" : "ACTIVE") &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount + 1 &&
    next.aiTurnCount === current.aiTurnCount &&
    next.storyDiceNextStep === expectedNextStep &&
    next.awaitingAiTurn === (expectedNextStep === "AI_QUESTION")
  );
}

function memoryCards(run: GameRunSnapshot) {
  return run.memoryQuestionCards && run.memoryAnswerCards
    ? [...run.memoryQuestionCards, ...run.memoryAnswerCards]
    : null;
}

function sameMemoryCardsExcept(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
  mutableIds: ReadonlySet<string>,
) {
  const currentCards = memoryCards(current);
  const nextCards = memoryCards(next);
  if (!currentCards || !nextCards || currentCards.length !== nextCards.length) return false;
  const nextById = new Map(nextCards.map((card) => [card.id, card]));
  return currentCards.every((card) => {
    const nextCard = nextById.get(card.id);
    if (!nextCard || nextCard.type !== card.type) return false;
    return mutableIds.has(card.id) || JSON.stringify(nextCard) === JSON.stringify(card);
  });
}

function validMemoryCompletionCards(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
  newlyTakenIds: ReadonlySet<string>,
) {
  const currentCards = memoryCards(current);
  const nextCards = memoryCards(next);
  if (!currentCards || !nextCards || currentCards.length !== nextCards.length) return false;
  const nextById = new Map(nextCards.map((card) => [card.id, card]));
  return currentCards.every((card) => {
    const nextCard = nextById.get(card.id);
    if (!nextCard || nextCard.type !== card.type || nextCard.state === "HIDDEN") return false;
    if (card.state === "TAKEN") return JSON.stringify(nextCard) === JSON.stringify(card);
    if (newlyTakenIds.has(card.id)) return nextCard.state === "TAKEN";
    return nextCard.state === "REVEALED";
  });
}

function sameMemoryRunIdentity(current: GameRunSnapshot, next: GameRunSnapshot) {
  return (
    current.gameId === "memory" &&
    next.gameId === "memory" &&
    next.id === current.id &&
    next.mode === current.mode &&
    next.preview === current.preview &&
    next.memoryDifficulty === current.memoryDifficulty &&
    next.targetCount === current.targetCount &&
    next.version === current.version + 1
  );
}

function isExpectedMemoryFlipAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
  cardId: string,
) {
  if (!sameMemoryRunIdentity(current, next)) return false;
  const currentCards = memoryCards(current);
  const nextCards = memoryCards(next);
  const selected = currentCards?.find((card) => card.id === cardId);
  const nextSelected = nextCards?.find((card) => card.id === cardId);
  if (!currentCards || !nextCards || !selected || !nextSelected || selected.state !== "HIDDEN") {
    return false;
  }
  if (current.memoryNextStep === "STUDENT_QUESTION") {
    return (
      selected.type === "q" &&
      nextSelected.type === "q" &&
      nextSelected.state === "REVEALED" &&
      Boolean(nextSelected.contentKey) &&
      next.status === "ACTIVE" &&
      next.memoryNextStep === "STUDENT_ANSWER" &&
      next.questionCount === current.questionCount &&
      next.aiTurnCount === current.aiTurnCount &&
      next.studentMatchCount === current.studentMatchCount &&
      next.aiMatchCount === current.aiMatchCount &&
      next.memoryMissReveal === null &&
      next.memoryReview === null &&
      !next.awaitingAiTurn &&
      sameMemoryCardsExcept(current, next, new Set([cardId]))
    );
  }
  if (current.memoryNextStep !== "STUDENT_ANSWER" || selected.type !== "a") return false;
  const revealedQuestion = current.memoryQuestionCards?.find(
    (card) => card.state === "REVEALED",
  );
  const nextQuestion = next.memoryQuestionCards?.find(
    (card) => card.id === revealedQuestion?.id,
  );
  if (!revealedQuestion?.contentKey || !nextQuestion || !nextSelected.contentKey) return false;
  const isMatch = revealedQuestion.contentKey === nextSelected.contentKey;
  const nextTotalMatches = (next.studentMatchCount ?? 0) + (next.aiMatchCount ?? 0);
  const pairCount = next.memoryQuestionCards?.length ?? 0;
  const completesRun = next.questionCount === next.targetCount || nextTotalMatches === pairCount;
  const cardsAreValid = completesRun && isMatch
    ? validMemoryCompletionCards(
        current,
        next,
        new Set([revealedQuestion.id, cardId]),
      )
    : sameMemoryCardsExcept(current, next, new Set([revealedQuestion.id, cardId]));
  if (
    next.questionCount !== current.questionCount + 1 ||
    next.aiTurnCount !== current.aiTurnCount ||
    next.aiMatchCount !== current.aiMatchCount ||
    !cardsAreValid
  ) return false;
  if (isMatch) {
    return (
      nextQuestion.state === "TAKEN" &&
      nextSelected.state === "TAKEN" &&
      nextQuestion.contentKey === nextSelected.contentKey &&
      next.studentMatchCount === (current.studentMatchCount ?? 0) + 1 &&
      next.memoryMissReveal === null &&
      next.status === (completesRun ? "SETTLED" : "ACTIVE") &&
      next.memoryNextStep === (completesRun ? "COMPLETE" : "STUDENT_QUESTION") &&
      next.awaitingAiTurn === false &&
      (completesRun ? Array.isArray(next.memoryReview) : next.memoryReview === null)
    );
  }
  return (
    nextQuestion.state === "REVEALED" &&
    nextSelected.state === "REVEALED" &&
    next.studentMatchCount === current.studentMatchCount &&
    next.memoryNextStep === "RESOLVE_MISS" &&
    next.status === "ACTIVE" &&
    next.memoryMissReveal?.actor === "STUDENT" &&
    next.memoryMissReveal.result === "MISS" &&
    next.memoryReview === null &&
    !next.awaitingAiTurn
  );
}

function isExpectedMemoryAiAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  if (
    !sameMemoryRunIdentity(current, next) ||
    current.mode !== "AI" ||
    current.memoryNextStep !== "AI_TURN" ||
    next.questionCount !== current.questionCount + 1 ||
    next.aiTurnCount !== current.aiTurnCount + 1 ||
    next.studentMatchCount !== current.studentMatchCount
  ) return false;
  const currentCards = memoryCards(current);
  const nextCards = memoryCards(next);
  if (!currentCards || !nextCards) return false;
  const nextById = new Map(nextCards.map((card) => [card.id, card]));
  const changed = currentCards.filter((card) => {
    const nextCard = nextById.get(card.id);
    return !nextCard || JSON.stringify(nextCard) !== JSON.stringify(card);
  });
  if (changed.some((card) => card.state !== "HIDDEN")) return false;
  const newlyTaken = changed.filter((card) => nextById.get(card.id)?.state === "TAKEN");
  const newlyRevealed = changed.filter((card) => nextById.get(card.id)?.state === "REVEALED");
  const selected = newlyTaken.length === 2 ? newlyTaken : newlyRevealed;
  if (
    selected.length !== 2 ||
    !selected.some((card) => card.type === "q") ||
    !selected.some((card) => card.type === "a")
  ) return false;
  const nextSelected = selected.map((card) => nextById.get(card.id));
  const nextQuestion = nextSelected.find((card) => card?.type === "q");
  const nextAnswer = nextSelected.find((card) => card?.type === "a");
  if (!nextQuestion?.contentKey || !nextAnswer?.contentKey) return false;
  const isMatch = newlyTaken.length === 2 &&
    nextQuestion.contentKey === nextAnswer.contentKey;
  const nextTotalMatches = (next.studentMatchCount ?? 0) + (next.aiMatchCount ?? 0);
  const pairCount = next.memoryQuestionCards?.length ?? 0;
  const completesRun = next.questionCount === next.targetCount || nextTotalMatches === pairCount;
  if (isMatch) {
    const cardsAreValid = completesRun
      ? validMemoryCompletionCards(
          current,
          next,
          new Set(newlyTaken.map((card) => card.id)),
        )
      : changed.length === 2 &&
        sameMemoryCardsExcept(current, next, new Set(newlyTaken.map((card) => card.id)));
    return (
      cardsAreValid &&
      nextQuestion.state === "TAKEN" &&
      nextAnswer.state === "TAKEN" &&
      next.aiMatchCount === (current.aiMatchCount ?? 0) + 1 &&
      next.memoryMissReveal === null &&
      next.status === (completesRun ? "SETTLED" : "ACTIVE") &&
      next.memoryNextStep === (completesRun ? "COMPLETE" : "AI_TURN") &&
      next.awaitingAiTurn === !completesRun &&
      (completesRun ? Array.isArray(next.memoryReview) : next.memoryReview === null)
    );
  }
  return (
    changed.length === 2 &&
    newlyRevealed.length === 2 &&
    newlyTaken.length === 0 &&
    sameMemoryCardsExcept(current, next, new Set(newlyRevealed.map((card) => card.id))) &&
    nextQuestion.contentKey !== nextAnswer.contentKey &&
    nextQuestion.state === "REVEALED" &&
    nextAnswer.state === "REVEALED" &&
    next.aiMatchCount === current.aiMatchCount &&
    next.status === "ACTIVE" &&
    next.memoryNextStep === "RESOLVE_MISS" &&
    next.memoryMissReveal?.actor === "AI" &&
    next.memoryMissReveal.result === "MISS" &&
    next.memoryReview === null &&
    !next.awaitingAiTurn
  );
}

function isExpectedMemoryResolveAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
  revealId: string,
) {
  if (
    !sameMemoryRunIdentity(current, next) ||
    current.memoryNextStep !== "RESOLVE_MISS" ||
    current.memoryMissReveal?.id !== revealId ||
    next.questionCount !== current.questionCount ||
    next.aiTurnCount !== current.aiTurnCount ||
    next.studentMatchCount !== current.studentMatchCount ||
    next.aiMatchCount !== current.aiMatchCount ||
    next.memoryMissReveal !== null
  ) return false;
  const revealed = memoryCards(current)?.filter((card) => card.state === "REVEALED") ?? [];
  const nextCards = memoryCards(next);
  if (revealed.length !== 2 || !nextCards) return false;
  const completesRun = current.questionCount === current.targetCount;
  const cardsAreValid = completesRun
    ? validMemoryCompletionCards(current, next, new Set())
    : revealed.every((card) => {
        const restored = nextCards.find((candidate) => candidate.id === card.id);
        return restored?.state === "HIDDEN" && restored.contentKey === undefined;
      }) && sameMemoryCardsExcept(
        current,
        next,
        new Set(revealed.map((card) => card.id)),
      );
  if (!cardsAreValid) return false;
  const expectedNextStep = completesRun
    ? "COMPLETE"
    : current.memoryMissReveal.actor === "AI"
      ? "STUDENT_QUESTION"
      : current.mode === "AI"
        ? "AI_TURN"
        : "STUDENT_QUESTION";
  return (
    next.status === (completesRun ? "SETTLED" : "ACTIVE") &&
    next.memoryNextStep === expectedNextStep &&
    next.awaitingAiTurn === (expectedNextStep === "AI_TURN") &&
    (completesRun ? Array.isArray(next.memoryReview) : next.memoryReview === null)
  );
}

export function useGameRun() {
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  const createRequestRef = useRef<RetriableRequest | null>(null);
  const actionRequestRef = useRef<RetriableActionRequest | null>(null);
  const diceRollRequestRef = useRef<RetriableRequest | null>(null);
  const storyRollRequestRef = useRef<RetriableRequest | null>(null);
  const memoryActionRequestRef = useRef<RetriableRequest | null>(null);
  const aiIssueRequestRef = useRef<RetriableRequest | null>(null);
  const aiRecordRequestRef = useRef<RetriableAiRecordRequest | null>(null);
  const completeRequestRef = useRef<RetriableRequest | null>(null);
  const [run, setRun] = useState<GameRunSnapshot | null>(null);
  const [result, setResult] = useState<GameRunResult | null>(null);
  const [pending, setPending] = useState<PendingKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [unconfirmedQuestion, setUnconfirmedQuestion] = useState<string | null>(null);
  const [unconfirmedDiceAction, setUnconfirmedDiceAction] = useState(false);
  const [unconfirmedMemoryAction, setUnconfirmedMemoryAction] =
    useState<UnconfirmedMemoryAction | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const begin = useCallback((kind: Exclude<PendingKind, null>) => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setPending(kind);
    setError(null);
    return true;
  }, []);

  const finish = useCallback((generation: number) => {
    if (generationRef.current === generation) {
      inFlightRef.current = false;
    }
    if (mountedRef.current && generationRef.current === generation) {
      setPending(null);
    }
  }, []);

  const markConflict = useCallback((latestRun?: GameRunSnapshot) => {
    actionRequestRef.current = null;
    diceRollRequestRef.current = null;
    storyRollRequestRef.current = null;
    memoryActionRequestRef.current = null;
    aiIssueRequestRef.current = null;
    aiRecordRequestRef.current = null;
    completeRequestRef.current = null;
    if (latestRun) {
      setRun((current) => {
        if (!current || current.id !== latestRun.id) return current;
        return latestRun.version >= current.version ? latestRun : current;
      });
    }
    setUnconfirmedQuestion(null);
    setUnconfirmedDiceAction(false);
    setUnconfirmedMemoryAction(null);
    setError(null);
    setConflict(RUN_CONFLICT_MESSAGE);
  }, []);

  const start = useCallback(async (
    gameId: string,
    mode: "solo" | "ai",
    topic: string | readonly string[],
    locale: string,
    options: GameRunStartOptions = {},
  ) => {
    if (!begin("create")) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const expectedMode = mode === "ai" ? "AI" : "SOLO";
    const normalizedTopic = typeof topic === "string" ? topic.trim() : "";
    const normalizedTopics = Array.isArray(topic)
      ? topic.map((item) => item.trim())
      : null;
    const memoryDifficulty = options.difficulty;
    const key = `${gameId}:${mode}:${normalizedLocale}:${normalizedTopics
      ? JSON.stringify(normalizedTopics)
      : normalizedTopic}:${memoryDifficulty ?? ""}`;
    const request = createRequestRef.current?.key === key
      ? createRequestRef.current
      : { key, requestId: newRequestId() };
    createRequestRef.current = request;
    try {
      const response = await fetch("/api/question-games/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          mode,
          requestId: request.requestId,
          ...(normalizedTopics ? { topics: normalizedTopics } : { topic: normalizedTopic }),
          ...(memoryDifficulty ? { difficulty: memoryDifficulty } : {}),
          locale: normalizedLocale,
        }),
      });
      const value = await readJson(response);
      const nextRun = readRun(value.run);
      if (!nextRun) throw new Error("질문놀이 실행 정보를 확인할 수 없습니다.");
      if (nextRun.gameId !== gameId || nextRun.mode !== expectedMode) {
        createRequestRef.current = null;
        throw new Error("요청한 질문놀이 실행과 서버 응답이 일치하지 않습니다.");
      }
      if (gameId === "memory" && nextRun.memoryDifficulty !== memoryDifficulty) {
        createRequestRef.current = null;
        throw new Error("요청한 카드 짝 찾기 난이도와 서버 응답이 일치하지 않습니다.");
      }
      if (nextRun.status !== "ACTIVE") {
        createRequestRef.current = null;
        throw new Error("이미 닫힌 질문놀이 실행입니다. 다시 시작해 주세요.");
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      createRequestRef.current = null;
      actionRequestRef.current = null;
      diceRollRequestRef.current = null;
      storyRollRequestRef.current = null;
      memoryActionRequestRef.current = null;
      aiIssueRequestRef.current = null;
      aiRecordRequestRef.current = null;
      completeRequestRef.current = null;
      setRun(nextRun);
      setResult(null);
      setConflict(null);
      setUnconfirmedQuestion(null);
      setUnconfirmedDiceAction(false);
      setUnconfirmedMemoryAction(null);
      return nextRun;
    } catch (requestError) {
      if (mountedRef.current && generationRef.current === generation) {
        setError(requestError instanceof Error
          ? requestError.message
          : "질문놀이 실행을 시작하지 못했습니다.");
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, finish]);

  const executeMemoryAction = useCallback(async (
    action: UnconfirmedMemoryAction["action"],
    value: string | null,
    runOverride?: GameRunSnapshot,
  ): Promise<SubmittedMemoryAction | null> => {
    const activeRun = runOverride ?? run;
    if (
      !activeRun ||
      activeRun.gameId !== "memory" ||
      activeRun.status !== "ACTIVE" ||
      conflict
    ) return null;
    const selectedCard = value
      ? memoryCards(activeRun)?.find((card) => card.id === value)
      : null;
    const validAction = action === "memory-flip-card"
      ? Boolean(
          selectedCard?.state === "HIDDEN" &&
          ((activeRun.memoryNextStep === "STUDENT_QUESTION" && selectedCard.type === "q") ||
            (activeRun.memoryNextStep === "STUDENT_ANSWER" && selectedCard.type === "a")),
        )
      : action === "memory-ai-turn"
        ? activeRun.mode === "AI" && activeRun.memoryNextStep === "AI_TURN" && value === null
        : activeRun.memoryNextStep === "RESOLVE_MISS" &&
          activeRun.memoryMissReveal?.id === value;
    if (!validAction || !begin(action === "memory-ai-turn" ? "ai" : "action")) return null;
    const generation = generationRef.current;
    const key = `${activeRun.id}:${activeRun.version}:${action}:${value ?? ""}`;
    const request = memoryActionRequestRef.current?.key === key
      ? memoryActionRequestRef.current
      : { key, requestId: newRequestId() };
    memoryActionRequestRef.current = request;
    const uncertainAction: UnconfirmedMemoryAction = action === "memory-flip-card"
      ? { action, cardId: value as string }
      : action === "memory-resolve-miss"
        ? { action, revealId: value as string }
        : { action };
    const expectedAdvance = (nextRun: GameRunSnapshot) => action === "memory-flip-card"
      ? isExpectedMemoryFlipAdvance(activeRun, nextRun, value as string)
      : action === "memory-ai-turn"
        ? isExpectedMemoryAiAdvance(activeRun, nextRun)
        : isExpectedMemoryResolveAdvance(activeRun, nextRun, value as string);
    const fallback = action === "memory-flip-card"
      ? "카드를 뒤집지 못했습니다."
      : action === "memory-ai-turn"
        ? "인공지능 차례를 진행하지 못했습니다."
        : "보여 준 카드를 다시 덮지 못했습니다.";
    try {
      const responseValue = await readJson(await fetch(
        `/api/question-games/runs/${activeRun.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            requestId: request.requestId,
            expectedVersion: activeRun.version,
            ...(action === "memory-flip-card" ? { cardId: value } : {}),
            ...(action === "memory-resolve-miss" ? { revealId: value } : {}),
          }),
        },
      ));
      let nextRun = readRun(responseValue.run);
      if (!nextRun || !expectedAdvance(nextRun)) {
        throw new Error("카드 짝 찾기 진행 결과를 확인할 수 없습니다.");
      }
      let nextResult = readSettlementResult(responseValue.result, nextRun);
      if (responseValue.replayed === true) {
        const current = await readRunResult(activeRun.id);
        if (!isSameRunProgress(current.run, nextRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(current.run);
          }
          return null;
        }
        nextRun = current.run;
        nextResult = current.result;
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      memoryActionRequestRef.current = null;
      setRun(nextRun);
      if (nextResult) setResult(nextResult);
      setUnconfirmedMemoryAction(null);
      setError(null);
      return { run: nextRun, result: nextResult };
    } catch (requestError) {
      const explicitlyRejected = isExplicitRequestRejection(requestError);
      const message = requestErrorMessage(requestError, fallback);
      try {
        const recovered = await readRunResult(activeRun.id);
        if (!explicitlyRejected && expectedAdvance(recovered.run)) {
          if (!mountedRef.current || generationRef.current !== generation) return null;
          memoryActionRequestRef.current = null;
          setRun(recovered.run);
          if (recovered.result) setResult(recovered.result);
          setUnconfirmedMemoryAction(null);
          setError(null);
          return recovered;
        }
        if (mountedRef.current && generationRef.current === generation) {
          if (isSameRunProgress(recovered.run, activeRun)) {
            if (explicitlyRejected) {
              memoryActionRequestRef.current = null;
              setUnconfirmedMemoryAction(null);
            } else {
              setUnconfirmedMemoryAction(uncertainAction);
            }
            setError(message);
          } else {
            markConflict(recovered.run);
          }
        }
      } catch {
        if (mountedRef.current && generationRef.current === generation) {
          if (explicitlyRejected) {
            memoryActionRequestRef.current = null;
            setUnconfirmedMemoryAction(null);
          } else {
            setUnconfirmedMemoryAction(uncertainAction);
          }
          setError(message);
        }
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const flipMemoryCard = useCallback((
    cardId: string,
    runOverride?: GameRunSnapshot,
  ) => executeMemoryAction("memory-flip-card", cardId, runOverride), [executeMemoryAction]);

  const runMemoryAiTurn = useCallback((runOverride?: GameRunSnapshot) =>
    executeMemoryAction("memory-ai-turn", null, runOverride), [executeMemoryAction]);

  const resolveMemoryMiss = useCallback((
    revealId: string,
    runOverride?: GameRunSnapshot,
  ) => executeMemoryAction(
    "memory-resolve-miss",
    revealId,
    runOverride,
  ), [executeMemoryAction]);

  const rollDice = useCallback(async (
    runOverride?: GameRunSnapshot,
  ): Promise<GameRunSnapshot | null> => {
    const activeRun = runOverride ?? run;
    if (
      !activeRun ||
      activeRun.gameId !== "dice" ||
      (activeRun.nextStep !== "STUDENT_ROLL" && activeRun.nextStep !== "AI_ROLL") ||
      conflict ||
      !begin("action")
    ) return null;
    const generation = generationRef.current;
    const key = `${activeRun.id}:${activeRun.version}:dice-roll`;
    const request = diceRollRequestRef.current?.key === key
      ? diceRollRequestRef.current
      : { key, requestId: newRequestId() };
    diceRollRequestRef.current = request;
    try {
      const value = await readJson(await fetch(
        `/api/question-games/runs/${activeRun.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "dice-roll",
            requestId: request.requestId,
            expectedVersion: activeRun.version,
          }),
        },
      ));
      let nextRun = readRun(value.run);
      if (!nextRun || !isExpectedDiceRollAdvance(activeRun, nextRun)) {
        throw new Error("주사위 결과를 확인할 수 없습니다.");
      }
      if (value.replayed === true) {
        const current = await readRunResult(activeRun.id);
        if (!isSameRunProgress(current.run, nextRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(current.run);
          }
          return null;
        }
        nextRun = current.run;
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      diceRollRequestRef.current = null;
      setUnconfirmedDiceAction(false);
      setRun(nextRun);
      setError(null);
      return nextRun;
    } catch (requestError) {
      const explicitlyRejected = isExplicitRequestRejection(requestError);
      const message = requestErrorMessage(requestError, "주사위를 굴리지 못했습니다.");
      try {
        const recovered = await readRunResult(activeRun.id);
        if (!explicitlyRejected && isExpectedDiceRollAdvance(activeRun, recovered.run)) {
          if (!mountedRef.current || generationRef.current !== generation) return null;
          diceRollRequestRef.current = null;
          setUnconfirmedDiceAction(false);
          setRun(recovered.run);
          setError(null);
          return recovered.run;
        }
        if (!isSameRunProgress(recovered.run, activeRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(recovered.run);
          }
          return null;
        }
      } catch {
        // 적용 여부가 불확실하면 같은 요청 식별값으로 다시 확인한다.
      }
      if (mountedRef.current && generationRef.current === generation) {
        if (explicitlyRejected) {
          diceRollRequestRef.current = null;
          setUnconfirmedDiceAction(false);
        } else {
          setUnconfirmedDiceAction(true);
        }
        setError(message);
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const rollStoryDice = useCallback(async (
    runOverride?: GameRunSnapshot,
  ): Promise<GameRunSnapshot | null> => {
    const activeRun = runOverride ?? run;
    if (
      !activeRun ||
      activeRun.gameId !== "story-dice" ||
      activeRun.status !== "ACTIVE" ||
      activeRun.storyDiceNextStep !== "ROLL" ||
      conflict ||
      !begin("action")
    ) return null;
    const generation = generationRef.current;
    const key = `${activeRun.id}:${activeRun.version}:story-dice-roll`;
    const request = storyRollRequestRef.current?.key === key
      ? storyRollRequestRef.current
      : { key, requestId: newRequestId() };
    storyRollRequestRef.current = request;
    try {
      const value = await readJson(await fetch(
        `/api/question-games/runs/${activeRun.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "story-dice-roll",
            requestId: request.requestId,
            expectedVersion: activeRun.version,
          }),
        },
      ));
      let nextRun = readRun(value.run);
      if (!nextRun || !isExpectedStoryDiceRollAdvance(activeRun, nextRun)) {
        throw new Error("이야기 주사위 결과를 확인할 수 없습니다.");
      }
      if (value.replayed === true) {
        const current = await readRunResult(activeRun.id);
        if (!isSameRunProgress(current.run, nextRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(current.run);
          }
          return null;
        }
        nextRun = current.run;
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      storyRollRequestRef.current = null;
      setRun(nextRun);
      setError(null);
      return nextRun;
    } catch (requestError) {
      const explicitlyRejected = isExplicitRequestRejection(requestError);
      const message = requestErrorMessage(
        requestError,
        "이야기 주사위를 굴리지 못했습니다.",
      );
      try {
        const recovered = await readRunResult(activeRun.id);
        if (
          !explicitlyRejected &&
          isExpectedStoryDiceRollAdvance(activeRun, recovered.run)
        ) {
          if (!mountedRef.current || generationRef.current !== generation) return null;
          storyRollRequestRef.current = null;
          setRun(recovered.run);
          setError(null);
          return recovered.run;
        }
        if (!isSameRunProgress(recovered.run, activeRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(recovered.run);
          }
          return null;
        }
      } catch {
        // 적용 여부가 불확실하면 같은 요청 식별값으로 다시 확인한다.
      }
      if (mountedRef.current && generationRef.current === generation) {
        if (explicitlyRejected) storyRollRequestRef.current = null;
        setError(message);
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const submitStoryDiceTextAction = useCallback(async (
    action: "story-dice-submit-story" | "story-dice-submit-question" | "story-dice-submit-answer",
    text: string,
    locale: string,
    runOverride?: GameRunSnapshot,
  ): Promise<SubmittedStoryDiceAction | null> => {
    const activeRun = runOverride ?? run;
    const expectedStep = action === "story-dice-submit-story"
      ? "STORY"
      : action === "story-dice-submit-question"
        ? "STUDENT_QUESTION"
        : "STUDENT_ANSWER";
    if (
      !activeRun ||
      activeRun.gameId !== "story-dice" ||
      activeRun.status !== "ACTIVE" ||
      activeRun.storyDiceNextStep !== expectedStep ||
      conflict ||
      !begin("action")
    ) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const key = [activeRun.id, activeRun.version, action, normalizedLocale, text].join(":");
    const request = actionRequestRef.current?.key === key
      ? actionRequestRef.current
      : { key, requestId: newRequestId(), question: text };
    actionRequestRef.current = request;
    const field = action === "story-dice-submit-story"
      ? "story"
      : action === "story-dice-submit-question"
        ? "question"
        : "answer";
    const expectedAdvance = action === "story-dice-submit-story"
      ? isExpectedStoryDiceStoryAdvance
      : action === "story-dice-submit-question"
        ? isExpectedStoryDiceQuestionAdvance
        : isExpectedStoryDiceAnswerAdvance;
    try {
      const value = await readJson(await fetch(
        `/api/question-games/runs/${activeRun.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            requestId: request.requestId,
            expectedVersion: activeRun.version,
            [field]: text,
            locale: normalizedLocale,
          }),
        },
      ));
      let nextRun = readRun(value.run);
      if (!nextRun || !expectedAdvance(activeRun, nextRun)) {
        throw new Error("이야기 주사위 저장 결과를 확인할 수 없습니다.");
      }
      let nextResult = readSettlementResult(value.result, nextRun);
      if (value.replayed === true) {
        const current = await readRunResult(activeRun.id);
        if (!isSameRunProgress(current.run, nextRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(current.run);
          }
          return null;
        }
        nextRun = current.run;
        nextResult = current.result;
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      actionRequestRef.current = null;
      setRun(nextRun);
      if (nextResult) setResult(nextResult);
      setUnconfirmedQuestion(null);
      setError(null);
      return { run: nextRun, result: nextResult };
    } catch (requestError) {
      const explicitlyRejected = isExplicitRequestRejection(requestError);
      const message = requestErrorMessage(
        requestError,
        "이야기 주사위 내용을 저장하지 못했습니다.",
      );
      try {
        const recovered = await readRunResult(activeRun.id);
        if (!explicitlyRejected && expectedAdvance(activeRun, recovered.run)) {
          if (!mountedRef.current || generationRef.current !== generation) return null;
          actionRequestRef.current = null;
          setRun(recovered.run);
          if (recovered.result) setResult(recovered.result);
          setUnconfirmedQuestion(null);
          setError(null);
          return recovered;
        }
        if (mountedRef.current && generationRef.current === generation) {
          if (isSameRunProgress(recovered.run, activeRun)) {
            if (explicitlyRejected) {
              actionRequestRef.current = null;
              setUnconfirmedQuestion(null);
            } else {
              setUnconfirmedQuestion(request.question);
            }
            setError(message);
          } else {
            markConflict(recovered.run);
          }
        }
      } catch {
        if (mountedRef.current && generationRef.current === generation) {
          if (explicitlyRejected) {
            actionRequestRef.current = null;
            setUnconfirmedQuestion(null);
          } else {
            setUnconfirmedQuestion(request.question);
          }
          setError(message);
        }
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const submitRelayQuestion = useCallback(async (
    question: string,
    locale: string,
  ): Promise<SubmittedRelayQuestion | null> => {
    if (!run || conflict || !begin("action")) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const key = `${run.id}:${run.version}:${normalizedLocale}:${question}`;
    const request = actionRequestRef.current?.key === key
      ? actionRequestRef.current
      : { key, requestId: newRequestId(), question };
    actionRequestRef.current = request;
    try {
      const response = await fetch(`/api/question-games/runs/${run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "relay-submit-question",
          requestId: request.requestId,
          expectedVersion: run.version,
          question,
          locale: normalizedLocale,
        }),
      });
      const value = await readJson(response);
      let nextRun = readRun(value.run);
      if (!nextRun || !isExpectedQuestionAdvance(run, nextRun)) {
        throw new Error("질문 저장 결과를 확인할 수 없습니다.");
      }
      let nextResult = readSettlementResult(value.result, nextRun);
      if (value.replayed === true) {
        const current = await readRunResult(run.id);
        if (!isSameRunProgress(current.run, nextRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(current.run);
          }
          return null;
        }
        nextRun = current.run;
        nextResult = current.result;
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      actionRequestRef.current = null;
      setRun(nextRun);
      if (nextResult) setResult(nextResult);
      setUnconfirmedQuestion(null);
      return { run: nextRun, result: nextResult };
    } catch (requestError) {
      const message = requestErrorMessage(requestError, "질문을 저장하지 못했습니다.");
      const actionWasExplicitlyRejected = isExplicitRequestRejection(requestError);
      try {
        const recovered = await readRunResult(run.id);
        const actionWasApplied = !actionWasExplicitlyRejected &&
          isExpectedQuestionAdvance(run, recovered.run);
        if (actionWasApplied) {
          if (!mountedRef.current || generationRef.current !== generation) return null;
          actionRequestRef.current = null;
          setRun(recovered.run);
          if (recovered.result) setResult(recovered.result);
          setUnconfirmedQuestion(null);
          setError(null);
          return recovered;
        }
        const stateIsUnchanged = isSameRunProgress(recovered.run, run);
        if (mountedRef.current && generationRef.current === generation) {
          if (stateIsUnchanged) {
            if (actionWasExplicitlyRejected) {
              actionRequestRef.current = null;
              setUnconfirmedQuestion(null);
            } else {
              setUnconfirmedQuestion(request.question);
            }
            setError(message);
          } else {
            markConflict(recovered.run);
          }
        }
      } catch {
        if (mountedRef.current && generationRef.current === generation) {
          if (actionWasExplicitlyRejected) {
            actionRequestRef.current = null;
            setUnconfirmedQuestion(null);
          } else {
            setUnconfirmedQuestion(request.question);
          }
          setError(message);
        }
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const submitDiceQuestion = useCallback(async (
    question: string,
    locale: string,
    runOverride?: GameRunSnapshot,
  ): Promise<SubmittedDiceQuestion | null> => {
    const activeRun = runOverride ?? run;
    if (
      !activeRun ||
      activeRun.gameId !== "dice" ||
      activeRun.nextStep !== "STUDENT_QUESTION" ||
      activeRun.pendingRoll?.actor !== "STUDENT" ||
      conflict ||
      !begin("action")
    ) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const key = `${activeRun.id}:${activeRun.version}:dice-question:${normalizedLocale}:${question}`;
    const request = actionRequestRef.current?.key === key
      ? actionRequestRef.current
      : { key, requestId: newRequestId(), question };
    actionRequestRef.current = request;
    try {
      const value = await readJson(await fetch(
        `/api/question-games/runs/${activeRun.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "dice-submit-question",
            requestId: request.requestId,
            expectedVersion: activeRun.version,
            question,
            locale: normalizedLocale,
          }),
        },
      ));
      let nextRun = readRun(value.run);
      if (!nextRun || !isExpectedDiceQuestionAdvance(activeRun, nextRun)) {
        throw new Error("질문 저장 결과를 확인할 수 없습니다.");
      }
      let nextResult = readSettlementResult(value.result, nextRun);
      if (value.replayed === true) {
        const current = await readRunResult(activeRun.id);
        if (!isSameRunProgress(current.run, nextRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(current.run);
          }
          return null;
        }
        nextRun = current.run;
        nextResult = current.result;
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      actionRequestRef.current = null;
      setRun(nextRun);
      if (nextResult) setResult(nextResult);
      setUnconfirmedQuestion(null);
      setError(null);
      return { run: nextRun, result: nextResult };
    } catch (requestError) {
      const message = requestErrorMessage(requestError, "질문을 저장하지 못했습니다.");
      const explicitlyRejected = isExplicitRequestRejection(requestError);
      try {
        const recovered = await readRunResult(activeRun.id);
        if (!explicitlyRejected && isExpectedDiceQuestionAdvance(activeRun, recovered.run)) {
          if (!mountedRef.current || generationRef.current !== generation) return null;
          actionRequestRef.current = null;
          setRun(recovered.run);
          if (recovered.result) setResult(recovered.result);
          setUnconfirmedQuestion(null);
          setError(null);
          return recovered;
        }
        if (mountedRef.current && generationRef.current === generation) {
          if (isSameRunProgress(recovered.run, activeRun)) {
            if (explicitlyRejected) {
              actionRequestRef.current = null;
              setUnconfirmedQuestion(null);
            } else {
              setUnconfirmedQuestion(request.question);
            }
            setError(message);
          } else {
            markConflict(recovered.run);
          }
        }
      } catch {
        if (mountedRef.current && generationRef.current === generation) {
          if (explicitlyRejected) {
            actionRequestRef.current = null;
            setUnconfirmedQuestion(null);
          } else {
            setUnconfirmedQuestion(request.question);
          }
          setError(message);
        }
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const submitLadderQuestion = useCallback(async (
    question: string,
    startColumn: number,
    locale: string,
    runOverride?: GameRunSnapshot,
  ): Promise<SubmittedRelayQuestion | null> => {
    const activeRun = runOverride ?? run;
    if (
      !activeRun ||
      activeRun.gameId !== "ladder" ||
      activeRun.status !== "ACTIVE" ||
      activeRun.ladderRound !== activeRun.questionCount + 1 ||
      !Array.isArray(activeRun.ladderGrid) ||
      !Number.isSafeInteger(startColumn) ||
      startColumn < 0 ||
      startColumn >= (activeRun.mode === "AI" ? 2 : 4) ||
      conflict ||
      !begin("action")
    ) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const key = [
      activeRun.id,
      activeRun.version,
      "ladder-question",
      startColumn,
      normalizedLocale,
      question,
    ].join(":");
    const request = actionRequestRef.current?.key === key
      ? actionRequestRef.current
      : { key, requestId: newRequestId(), question };
    actionRequestRef.current = request;
    try {
      const value = await readJson(await fetch(
        `/api/question-games/runs/${activeRun.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ladder-submit-question",
            requestId: request.requestId,
            expectedVersion: activeRun.version,
            startColumn,
            question,
            locale: normalizedLocale,
          }),
        },
      ));
      let nextRun = readRun(value.run);
      if (!nextRun || !isExpectedLadderQuestionAdvance(activeRun, nextRun)) {
        throw new Error("질문 저장 결과를 확인할 수 없습니다.");
      }
      let nextResult = readSettlementResult(value.result, nextRun);
      if (value.replayed === true) {
        const current = await readRunResult(activeRun.id);
        if (!isSameRunProgress(current.run, nextRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(current.run);
          }
          return null;
        }
        nextRun = current.run;
        nextResult = current.result;
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      actionRequestRef.current = null;
      setRun(nextRun);
      if (nextResult) setResult(nextResult);
      setUnconfirmedQuestion(null);
      setError(null);
      return { run: nextRun, result: nextResult };
    } catch (requestError) {
      const message = requestErrorMessage(requestError, "질문을 저장하지 못했습니다.");
      const explicitlyRejected = isExplicitRequestRejection(requestError);
      try {
        const recovered = await readRunResult(activeRun.id);
        if (!explicitlyRejected && isExpectedLadderQuestionAdvance(activeRun, recovered.run)) {
          if (!mountedRef.current || generationRef.current !== generation) return null;
          actionRequestRef.current = null;
          setRun(recovered.run);
          if (recovered.result) setResult(recovered.result);
          setUnconfirmedQuestion(null);
          setError(null);
          return recovered;
        }
        if (mountedRef.current && generationRef.current === generation) {
          if (isSameRunProgress(recovered.run, activeRun)) {
            if (explicitlyRejected) {
              actionRequestRef.current = null;
              setUnconfirmedQuestion(null);
            } else {
              setUnconfirmedQuestion(request.question);
            }
            setError(message);
          } else {
            markConflict(recovered.run);
          }
        }
      } catch {
        if (mountedRef.current && generationRef.current === generation) {
          if (explicitlyRejected) {
            actionRequestRef.current = null;
            setUnconfirmedQuestion(null);
          } else {
            setUnconfirmedQuestion(request.question);
          }
          setError(message);
        }
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const submitKabaAttempt = useCallback(async (
    question: string,
    locale: string,
    runOverride?: GameRunSnapshot,
  ): Promise<SubmittedKabaAttempt | null> => {
    const activeRun = runOverride ?? run;
    if (
      !activeRun ||
      activeRun.gameId !== "kaba" ||
      activeRun.status !== "ACTIVE" ||
      activeRun.kabaNextStep !== "STUDENT_ATTEMPT" ||
      !activeRun.currentSentence ||
      conflict ||
      !begin("action")
    ) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const key = [
      activeRun.id,
      activeRun.version,
      "kaba-attempt",
      normalizedLocale,
      question,
    ].join(":");
    const request = actionRequestRef.current?.key === key
      ? actionRequestRef.current
      : { key, requestId: newRequestId(), question };
    actionRequestRef.current = request;

    const accept = (
      nextRun: GameRunSnapshot,
      nextResult: GameRunResult | null,
      correct: boolean,
    ): SubmittedKabaAttempt | null => {
      if (!isExpectedKabaAttemptAdvance(activeRun, nextRun, correct)) return null;
      actionRequestRef.current = null;
      setRun(nextRun);
      if (nextResult) setResult(nextResult);
      setUnconfirmedQuestion(null);
      setError(null);
      return { run: nextRun, result: nextResult, correct };
    };

    try {
      const value = await readJson(await fetch(
        `/api/question-games/runs/${activeRun.id}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "kaba-submit-attempt",
            requestId: request.requestId,
            expectedVersion: activeRun.version,
            question,
            locale: normalizedLocale,
          }),
        },
      ));
      let nextRun = readRun(value.run);
      if (!nextRun || typeof value.correct !== "boolean") {
        throw new Error("까바놀이 판정 결과를 확인할 수 없습니다.");
      }
      let nextResult = readSettlementResult(value.result, nextRun);
      let correct = value.correct;
      if (!isExpectedKabaAttemptAdvance(activeRun, nextRun, correct)) {
        throw new Error("까바놀이 판정 결과를 확인할 수 없습니다.");
      }
      if (value.replayed === true) {
        const current = await readRunResult(activeRun.id);
        if (!isSameRunProgress(current.run, nextRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(current.run);
          }
          return null;
        }
        nextRun = current.run;
        nextResult = current.result;
        const correctDelta = (nextRun.correctCount ?? 0) - (activeRun.correctCount ?? 0);
        if (correctDelta !== 0 && correctDelta !== 1) return null;
        correct = correctDelta === 1;
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      return accept(nextRun, nextResult, correct);
    } catch (requestError) {
      const message = requestErrorMessage(requestError, "까바놀이 답을 저장하지 못했습니다.");
      const explicitlyRejected = isExplicitRequestRejection(requestError);
      try {
        const recovered = await readRunResult(activeRun.id);
        const correctDelta =
          (recovered.run.correctCount ?? 0) - (activeRun.correctCount ?? 0);
        if (correctDelta === 0 || correctDelta === 1) {
          const correct = correctDelta === 1;
          if (
            !explicitlyRejected &&
            isExpectedKabaAttemptAdvance(activeRun, recovered.run, correct)
          ) {
            if (!mountedRef.current || generationRef.current !== generation) return null;
            return accept(recovered.run, recovered.result, correct);
          }
        }
        if (mountedRef.current && generationRef.current === generation) {
          if (isSameRunProgress(recovered.run, activeRun)) {
            if (explicitlyRejected) {
              actionRequestRef.current = null;
              setUnconfirmedQuestion(null);
            } else {
              setUnconfirmedQuestion(request.question);
            }
            setError(message);
          } else {
            markConflict(recovered.run);
          }
        }
      } catch {
        if (mountedRef.current && generationRef.current === generation) {
          if (explicitlyRejected) {
            actionRequestRef.current = null;
            setUnconfirmedQuestion(null);
          } else {
            setUnconfirmedQuestion(request.question);
          }
          setError(message);
        }
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const submitRelayAiTurn = useCallback(async (
    topic: string,
    previousQuestion: string,
    locale: string,
    runOverride?: GameRunSnapshot,
  ): Promise<RecordedRelayAiTurn | null> => {
    const activeRun = runOverride ?? run;
    if (!activeRun?.awaitingAiTurn || conflict || !begin("ai")) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const normalizedTopic = topic.trim();
    const normalizedQuestion = previousQuestion.trim();
    const key = [
      activeRun.id,
      activeRun.version,
      normalizedLocale,
      normalizedTopic,
      normalizedQuestion,
    ].join(":");
    const issueRequest = aiIssueRequestRef.current?.key === key
      ? aiIssueRequestRef.current
      : { key, requestId: newRequestId() };
    aiIssueRequestRef.current = issueRequest;

    let recordRequest = aiRecordRequestRef.current?.key === key
      ? aiRecordRequestRef.current
      : null;

    try {
      if (!recordRequest) {
        let issued: IssuedQuestionGameAiTurn;
        try {
          const value = await readJson(await fetch(
            `/api/question-games/runs/${activeRun.id}/ai-turn`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requestId: issueRequest.requestId,
                expectedVersion: activeRun.version,
                topic: normalizedTopic,
                previousQuestion: normalizedQuestion,
                locale: normalizedLocale,
              }),
            },
          ));
          const parsed = readIssuedQuestionGameAiTurn(value);
          if (!parsed || parsed.runVersion !== activeRun.version) {
            throw new Error("인공지능 질문 발급 결과를 확인할 수 없습니다.");
          }
          issued = parsed;
        } catch (requestError) {
          if (mountedRef.current && generationRef.current === generation) {
            setError(requestErrorMessage(
              requestError,
              "인공지능 질문을 만들지 못했습니다.",
            ));
          }
          return null;
        }

        if (!mountedRef.current || generationRef.current !== generation) return null;
        recordRequest = {
          key,
          requestId: newRequestId(),
          generationRequestId: issueRequest.requestId,
          issued,
        };
        aiRecordRequestRef.current = recordRequest;
      }

      try {
        const value = await readJson(await fetch(
          `/api/question-games/runs/${activeRun.id}/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "relay-record-ai-turn",
              requestId: recordRequest.requestId,
              generationRequestId: recordRequest.generationRequestId,
              expectedVersion: activeRun.version,
              output: recordRequest.issued.output,
              proof: recordRequest.issued.proof,
            }),
          },
        ));
        let nextRun = readRun(value.run);
        if (!nextRun || !isExpectedAiAdvance(activeRun, nextRun)) {
          throw new Error("인공지능 질문 기록 결과를 확인할 수 없습니다.");
        }
        if (value.replayed === true) {
          const current = await readRunResult(activeRun.id);
          if (!isSameRunProgress(current.run, nextRun)) {
            if (mountedRef.current && generationRef.current === generation) {
              markConflict(current.run);
            }
            return null;
          }
          nextRun = current.run;
        }
        if (!mountedRef.current || generationRef.current !== generation) return null;
        aiIssueRequestRef.current = null;
        aiRecordRequestRef.current = null;
        setUnconfirmedDiceAction(false);
        setRun(nextRun);
        setError(null);
        return { run: nextRun, output: recordRequest.issued.output };
      } catch (requestError) {
        const proofWasRejected = isRejectedAiProof(requestError);
        const explicitlyRejected = isExplicitRequestRejection(requestError);
        if (proofWasRejected) {
          aiRecordRequestRef.current = null;
        }
        const message = requestErrorMessage(
          requestError,
          "인공지능 질문을 기록하지 못했습니다.",
        );
        try {
          const recovered = await readRunResult(activeRun.id);
          const actionWasApplied = !explicitlyRejected &&
            isExpectedAiAdvance(activeRun, recovered.run);
          if (actionWasApplied) {
            if (!mountedRef.current || generationRef.current !== generation) return null;
            aiIssueRequestRef.current = null;
            aiRecordRequestRef.current = null;
            setRun(recovered.run);
            setError(null);
            return { run: recovered.run, output: recordRequest.issued.output };
          }
          if (!isSameRunProgress(recovered.run, activeRun)) {
            if (mountedRef.current && generationRef.current === generation) {
              markConflict(recovered.run);
            }
            return null;
          }
        } catch {
          // 일반 기록 실패는 같은 요청을 보관하고, 증명 거절은 위에서 폐기한다.
        }
        if (mountedRef.current && generationRef.current === generation) {
          setError(message);
        }
        return null;
      }
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const submitStoryDiceAiTurn = useCallback(async (
    story: string,
    previousAnswer: string,
    locale: string,
    runOverride?: GameRunSnapshot,
  ): Promise<RecordedRelayAiTurn | null> => {
    const activeRun = runOverride ?? run;
    if (
      !activeRun ||
      activeRun.gameId !== "story-dice" ||
      activeRun.mode !== "AI" ||
      activeRun.storyDiceNextStep !== "AI_QUESTION" ||
      !activeRun.awaitingAiTurn ||
      conflict ||
      !begin("ai")
    ) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const normalizedStory = story.trim();
    const normalizedPreviousAnswer = previousAnswer.trim();
    const key = [
      activeRun.id,
      activeRun.version,
      "story-dice-ai-question",
      normalizedLocale,
      normalizedStory,
      normalizedPreviousAnswer,
    ].join(":");
    const issueRequest = aiIssueRequestRef.current?.key === key
      ? aiIssueRequestRef.current
      : { key, requestId: newRequestId() };
    aiIssueRequestRef.current = issueRequest;
    let recordRequest = aiRecordRequestRef.current?.key === key
      ? aiRecordRequestRef.current
      : null;

    try {
      if (!recordRequest) {
        let issued: IssuedQuestionGameAiTurn;
        try {
          const value = await readJson(await fetch(
            `/api/question-games/runs/${activeRun.id}/ai-turn`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requestId: issueRequest.requestId,
                expectedVersion: activeRun.version,
                story: normalizedStory,
                previousAnswer: normalizedPreviousAnswer,
                locale: normalizedLocale,
              }),
            },
          ));
          const parsed = readIssuedQuestionGameAiTurn(value);
          if (!parsed || parsed.runVersion !== activeRun.version) {
            throw new Error("인공지능 이야기 질문 발급 결과를 확인할 수 없습니다.");
          }
          issued = parsed;
        } catch (requestError) {
          try {
            const recovered = await readRunResult(activeRun.id);
            if (!isSameRunProgress(recovered.run, activeRun)) {
              if (mountedRef.current && generationRef.current === generation) {
                markConflict(recovered.run);
              }
              return null;
            }
          } catch {
            // 발급 요청은 같은 요청 식별값으로 다시 확인할 수 있다.
          }
          if (mountedRef.current && generationRef.current === generation) {
            setError(requestErrorMessage(
              requestError,
              "인공지능 이야기 질문을 만들지 못했습니다.",
            ));
          }
          return null;
        }
        if (!mountedRef.current || generationRef.current !== generation) return null;
        recordRequest = {
          key,
          requestId: newRequestId(),
          generationRequestId: issueRequest.requestId,
          issued,
        };
        aiRecordRequestRef.current = recordRequest;
      }

      try {
        const value = await readJson(await fetch(
          `/api/question-games/runs/${activeRun.id}/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "story-dice-record-ai-question",
              requestId: recordRequest.requestId,
              generationRequestId: recordRequest.generationRequestId,
              expectedVersion: activeRun.version,
              output: recordRequest.issued.output,
              proof: recordRequest.issued.proof,
            }),
          },
        ));
        let nextRun = readRun(value.run);
        if (!nextRun || !isExpectedStoryDiceAiAdvance(activeRun, nextRun)) {
          throw new Error("인공지능 이야기 질문 기록 결과를 확인할 수 없습니다.");
        }
        if (value.replayed === true) {
          const current = await readRunResult(activeRun.id);
          if (!isSameRunProgress(current.run, nextRun)) {
            if (mountedRef.current && generationRef.current === generation) {
              markConflict(current.run);
            }
            return null;
          }
          nextRun = current.run;
        }
        if (!mountedRef.current || generationRef.current !== generation) return null;
        aiIssueRequestRef.current = null;
        aiRecordRequestRef.current = null;
        setRun(nextRun);
        setError(null);
        return { run: nextRun, output: recordRequest.issued.output };
      } catch (requestError) {
        const proofWasRejected = isRejectedAiProof(requestError);
        const explicitlyRejected = isExplicitRequestRejection(requestError);
        if (proofWasRejected) aiRecordRequestRef.current = null;
        const message = requestErrorMessage(
          requestError,
          "인공지능 이야기 질문을 기록하지 못했습니다.",
        );
        try {
          const recovered = await readRunResult(activeRun.id);
          if (
            !explicitlyRejected &&
            isExpectedStoryDiceAiAdvance(activeRun, recovered.run)
          ) {
            if (!mountedRef.current || generationRef.current !== generation) return null;
            aiIssueRequestRef.current = null;
            aiRecordRequestRef.current = null;
            setRun(recovered.run);
            setError(null);
            return { run: recovered.run, output: recordRequest.issued.output };
          }
          if (!isSameRunProgress(recovered.run, activeRun)) {
            if (mountedRef.current && generationRef.current === generation) {
              markConflict(recovered.run);
            }
            return null;
          }
        } catch {
          // 일반 기록 실패는 같은 요청을 보관하고, 증명 거절은 새 증명을 받는다.
        }
        if (mountedRef.current && generationRef.current === generation) {
          setError(message);
        }
        return null;
      }
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const submitDiceAiTurn = useCallback(async (
    locale: string,
    runOverride?: GameRunSnapshot,
  ): Promise<RecordedDiceAiTurn | null> => {
    const activeRun = runOverride ?? run;
    if (
      !activeRun ||
      activeRun.gameId !== "dice" ||
      activeRun.nextStep !== "AI_QUESTION" ||
      activeRun.pendingRoll?.actor !== "AI" ||
      conflict ||
      !begin("ai")
    ) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const key = [
      activeRun.id,
      activeRun.version,
      "dice-ai-question",
      normalizedLocale,
      activeRun.pendingRoll.face,
    ].join(":");
    const issueRequest = aiIssueRequestRef.current?.key === key
      ? aiIssueRequestRef.current
      : { key, requestId: newRequestId() };
    aiIssueRequestRef.current = issueRequest;
    let recordRequest = aiRecordRequestRef.current?.key === key
      ? aiRecordRequestRef.current
      : null;

    try {
      if (!recordRequest) {
        let issued: IssuedQuestionGameAiTurn;
        try {
          const value = await readJson(await fetch(
            `/api/question-games/runs/${activeRun.id}/ai-turn`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requestId: issueRequest.requestId,
                expectedVersion: activeRun.version,
                locale: normalizedLocale,
              }),
            },
          ));
          const parsed = readIssuedQuestionGameAiTurn(value);
          if (!parsed || parsed.runVersion !== activeRun.version) {
            throw new Error("인공지능 질문 발급 결과를 확인할 수 없습니다.");
          }
          issued = parsed;
        } catch (requestError) {
          if (mountedRef.current && generationRef.current === generation) {
            setError(requestErrorMessage(
              requestError,
              "인공지능 질문을 만들지 못했습니다.",
            ));
          }
          return null;
        }
        if (!mountedRef.current || generationRef.current !== generation) return null;
        recordRequest = {
          key,
          requestId: newRequestId(),
          generationRequestId: issueRequest.requestId,
          issued,
        };
        aiRecordRequestRef.current = recordRequest;
      }

      try {
        const value = await readJson(await fetch(
          `/api/question-games/runs/${activeRun.id}/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "dice-record-ai-question",
              requestId: recordRequest.requestId,
              generationRequestId: recordRequest.generationRequestId,
              expectedVersion: activeRun.version,
              output: recordRequest.issued.output,
              proof: recordRequest.issued.proof,
            }),
          },
        ));
        let nextRun = readRun(value.run);
        if (!nextRun || !isExpectedDiceAiAdvance(activeRun, nextRun)) {
          throw new Error("인공지능 질문 기록 결과를 확인할 수 없습니다.");
        }
        if (value.replayed === true) {
          const current = await readRunResult(activeRun.id);
          if (!isSameRunProgress(current.run, nextRun)) {
            if (mountedRef.current && generationRef.current === generation) {
              markConflict(current.run);
            }
            return null;
          }
          nextRun = current.run;
        }
        if (!mountedRef.current || generationRef.current !== generation) return null;
        aiIssueRequestRef.current = null;
        aiRecordRequestRef.current = null;
        setRun(nextRun);
        setError(null);
        return { run: nextRun, output: recordRequest.issued.output };
      } catch (requestError) {
        const proofWasRejected = isRejectedAiProof(requestError);
        const explicitlyRejected = isExplicitRequestRejection(requestError);
        if (proofWasRejected) aiRecordRequestRef.current = null;
        const message = requestErrorMessage(
          requestError,
          "인공지능 질문을 기록하지 못했습니다.",
        );
        try {
          const recovered = await readRunResult(activeRun.id);
          if (!explicitlyRejected && isExpectedDiceAiAdvance(activeRun, recovered.run)) {
            if (!mountedRef.current || generationRef.current !== generation) return null;
            aiIssueRequestRef.current = null;
            aiRecordRequestRef.current = null;
            setUnconfirmedDiceAction(false);
            setRun(recovered.run);
            setError(null);
            return { run: recovered.run, output: recordRequest.issued.output };
          }
          if (!isSameRunProgress(recovered.run, activeRun)) {
            if (mountedRef.current && generationRef.current === generation) {
              markConflict(recovered.run);
            }
            return null;
          }
        } catch {
          // 일반 기록 실패는 같은 요청을 보관하고, 증명 거절은 새 증명을 받는다.
        }
        if (mountedRef.current && generationRef.current === generation) {
          setUnconfirmedDiceAction(!explicitlyRejected);
          setError(message);
        }
        return null;
      }
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const submitStoryDiceStory = useCallback((
    story: string,
    locale: string,
    runOverride?: GameRunSnapshot,
  ) => submitStoryDiceTextAction(
    "story-dice-submit-story",
    story,
    locale,
    runOverride,
  ), [submitStoryDiceTextAction]);

  const submitStoryDiceQuestion = useCallback((
    question: string,
    locale: string,
    runOverride?: GameRunSnapshot,
  ) => submitStoryDiceTextAction(
    "story-dice-submit-question",
    question,
    locale,
    runOverride,
  ), [submitStoryDiceTextAction]);

  const submitStoryDiceAnswer = useCallback((
    answer: string,
    locale: string,
    runOverride?: GameRunSnapshot,
  ) => submitStoryDiceTextAction(
    "story-dice-submit-answer",
    answer,
    locale,
    runOverride,
  ), [submitStoryDiceTextAction]);

  const complete = useCallback(async (runOverride?: GameRunSnapshot) => {
    const activeRun = runOverride ?? run;
    if (!activeRun || conflict || !begin("complete")) return null;
    const generation = generationRef.current;
    const key = `${activeRun.id}:${activeRun.version}`;
    const request = completeRequestRef.current?.key === key
      ? completeRequestRef.current
      : { key, requestId: newRequestId() };
    completeRequestRef.current = request;
    try {
      const response = await fetch(`/api/question-games/runs/${activeRun.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.requestId,
          expectedVersion: activeRun.version,
        }),
      });
      const value = await readJson(response);
      const nextRun = readRun(value.run);
      const nextResult = readResult(value.result);
      if (!nextRun || !nextResult) {
        throw new Error("포인트 지급 결과를 확인할 수 없습니다.");
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      completeRequestRef.current = null;
      setRun(nextRun);
      setResult(nextResult);
      return nextResult;
    } catch (requestError) {
      const message = requestErrorMessage(requestError, "포인트 지급을 완료하지 못했습니다.");
      try {
        const recovered = await readRunResult(activeRun.id);
        if (
          recovered.run.id === activeRun.id &&
          recovered.run.status === "SETTLED" &&
          recovered.result
        ) {
          if (!mountedRef.current || generationRef.current !== generation) return null;
          completeRequestRef.current = null;
          setRun(recovered.run);
          setResult(recovered.result);
          setError(null);
          return recovered.result;
        }
        if (!isSameRunProgress(recovered.run, activeRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(recovered.run);
          }
          return null;
        }
      } catch {
        // 같은 완료 요청을 다시 보낼 수 있도록 요청 식별값을 유지한다.
      }
      if (mountedRef.current && generationRef.current === generation) {
        setError(message);
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    inFlightRef.current = false;
    createRequestRef.current = null;
    actionRequestRef.current = null;
    diceRollRequestRef.current = null;
    storyRollRequestRef.current = null;
    memoryActionRequestRef.current = null;
    aiIssueRequestRef.current = null;
    aiRecordRequestRef.current = null;
    completeRequestRef.current = null;
    setRun(null);
    setResult(null);
    setPending(null);
    setError(null);
    setConflict(null);
    setUnconfirmedQuestion(null);
    setUnconfirmedDiceAction(false);
    setUnconfirmedMemoryAction(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    run,
    result,
    pending,
    error,
    conflict,
    unconfirmedQuestion,
    unconfirmedDiceAction,
    unconfirmedMemoryAction,
    start,
    flipMemoryCard,
    runMemoryAiTurn,
    resolveMemoryMiss,
    rollDice,
    rollStoryDice,
    submitRelayQuestion,
    submitRelayAiTurn,
    submitDiceQuestion,
    submitDiceAiTurn,
    submitLadderQuestion,
    submitKabaAttempt,
    submitStoryDiceStory,
    submitStoryDiceQuestion,
    submitStoryDiceAiTurn,
    submitStoryDiceAnswer,
    complete,
    reset,
    clearError,
  };
}
