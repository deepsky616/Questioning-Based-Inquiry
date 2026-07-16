import type { Prisma } from "@prisma/client";
import { DAILY_LIMITS } from "@/lib/points-policy";
import {
  isQuestionGameRunRecord,
  QUESTION_GAME_REQUEST_ID_PATTERN,
  QuestionGameRunError,
  type QuestionGameRunCreateStateInput,
  type QuestionGameRunDefinition,
  type QuestionGameRunMode,
  type QuestionGameRunProgressContext,
  type QuestionGameRunResult,
} from "@/lib/question-game-run-definition";
import { QUESTION_GAME_LIMITS, QUESTION_GAME_RULES } from "@/lib/question-game-rules";

export type RelayNextActor = "STUDENT" | "AI" | "COMPLETE";

export interface EncryptedAiTurnResponse {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface RelayAiGenerationLease {
  id: string;
  generationRequestId: string;
  runVersion: number;
  expiresAt: number;
  issuedResponse?: EncryptedAiTurnResponse;
}

export interface RelayRunState {
  game: "relay";
  topicHash: string;
  topicLength: number;
  locale: "ko" | "en";
  questionCount: number;
  aiTurnCount: number;
  activitySequence: number;
  nextActor: RelayNextActor;
  targetCount: number;
  questionHashes: string[];
  aiGenerationLease?: RelayAiGenerationLease;
  result?: QuestionGameRunResult;
}

function parseRelayRunResult(value: unknown): QuestionGameRunResult | undefined {
  if (value === undefined) return undefined;
  if (!isQuestionGameRunRecord(value)) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  const { awarded, dailyLimit, dailyRemaining, cappedByLimit, preview } = value;
  if (
    typeof awarded !== "number" ||
    !Number.isSafeInteger(awarded) ||
    awarded < 0 ||
    typeof dailyLimit !== "number" ||
    !Number.isSafeInteger(dailyLimit) ||
    (dailyLimit !== DAILY_LIMITS.SOLO && dailyLimit !== DAILY_LIMITS.AI) ||
    typeof dailyRemaining !== "number" ||
    !Number.isSafeInteger(dailyRemaining) ||
    dailyRemaining < 0 ||
    awarded > dailyLimit ||
    dailyRemaining > dailyLimit ||
    awarded + dailyRemaining > dailyLimit ||
    typeof cappedByLimit !== "boolean" ||
    typeof preview !== "boolean"
  ) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  return { awarded, dailyLimit, dailyRemaining, cappedByLimit, preview };
}

function parseEncryptedAiTurnResponse(value: unknown): EncryptedAiTurnResponse | undefined {
  if (value === undefined) return undefined;
  if (!isQuestionGameRunRecord(value)) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  const { version, iv, authTag, ciphertext } = value;
  if (
    version !== 1 ||
    typeof iv !== "string" ||
    !/^[A-Za-z0-9_-]{16}$/.test(iv) ||
    typeof authTag !== "string" ||
    !/^[A-Za-z0-9_-]{22}$/.test(authTag) ||
    typeof ciphertext !== "string" ||
    ciphertext.length < 1 ||
    ciphertext.length > 8_192 ||
    !/^[A-Za-z0-9_-]+$/.test(ciphertext)
  ) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  return { version, iv, authTag, ciphertext };
}

export function parseRelayState(value: Prisma.JsonValue): RelayRunState {
  if (!isQuestionGameRunRecord(value)) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  const questionHashes = value.questionHashes;
  if (
    value.game !== "relay" ||
    typeof value.topicHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.topicHash) ||
    typeof value.topicLength !== "number" ||
    !Number.isSafeInteger(value.topicLength) ||
    value.topicLength < 1 ||
    value.topicLength > QUESTION_GAME_LIMITS.topic ||
    (value.locale !== "ko" && value.locale !== "en") ||
    typeof value.questionCount !== "number" ||
    !Number.isSafeInteger(value.questionCount) ||
    value.questionCount < 0 ||
    typeof value.aiTurnCount !== "number" ||
    !Number.isSafeInteger(value.aiTurnCount) ||
    value.aiTurnCount < 0 ||
    typeof value.activitySequence !== "number" ||
    !Number.isSafeInteger(value.activitySequence) ||
    value.activitySequence < 0 ||
    (value.nextActor !== "STUDENT" && value.nextActor !== "AI" && value.nextActor !== "COMPLETE") ||
    typeof value.targetCount !== "number" ||
    !Number.isSafeInteger(value.targetCount) ||
    value.targetCount !== QUESTION_GAME_RULES.relay.targets.solo.count ||
    !Array.isArray(questionHashes) ||
    !questionHashes.every(
      (item): item is string => typeof item === "string" && /^[0-9a-f]{64}$/.test(item),
    )
  ) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  let aiGenerationLease: RelayAiGenerationLease | undefined;
  if (value.aiGenerationLease !== undefined) {
    const lease = value.aiGenerationLease;
    if (
      !isQuestionGameRunRecord(lease) ||
      typeof lease.id !== "string" ||
      !QUESTION_GAME_REQUEST_ID_PATTERN.test(lease.id) ||
      typeof lease.generationRequestId !== "string" ||
      !QUESTION_GAME_REQUEST_ID_PATTERN.test(lease.generationRequestId) ||
      typeof lease.runVersion !== "number" ||
      !Number.isSafeInteger(lease.runVersion) ||
      lease.runVersion < 1 ||
      typeof lease.expiresAt !== "number" ||
      !Number.isSafeInteger(lease.expiresAt) ||
      lease.expiresAt < 1
    ) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
    }
    const issuedResponse = parseEncryptedAiTurnResponse(lease.issuedResponse);
    aiGenerationLease = {
      id: lease.id,
      generationRequestId: lease.generationRequestId,
      runVersion: lease.runVersion,
      expiresAt: lease.expiresAt,
      ...(issuedResponse ? { issuedResponse } : {}),
    };
  }
  const result = parseRelayRunResult(value.result);
  return {
    game: "relay",
    topicHash: value.topicHash,
    topicLength: value.topicLength,
    locale: value.locale,
    questionCount: value.questionCount,
    aiTurnCount: value.aiTurnCount,
    activitySequence: value.activitySequence,
    nextActor: value.nextActor,
    targetCount: value.targetCount,
    questionHashes,
    ...(aiGenerationLease ? { aiGenerationLease } : {}),
    ...(result ? { result } : {}),
  };
}

export function ensureRelayProgress(
  state: RelayRunState,
  mode: QuestionGameRunMode,
  runVersion: number,
  activeRun = true,
) {
  if (
    state.questionCount > state.targetCount ||
    state.aiTurnCount > state.targetCount - 1 ||
    state.activitySequence !== state.questionCount + state.aiTurnCount ||
    (state.aiGenerationLease !== undefined &&
      (mode !== "AI" ||
        state.nextActor !== "AI" ||
        (activeRun && state.aiGenerationLease.runVersion !== runVersion)))
  ) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }

  let expectedNextActor: RelayNextActor;
  if (mode === "SOLO") {
    if (state.aiTurnCount !== 0) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
    }
    expectedNextActor = state.questionCount === state.targetCount ? "COMPLETE" : "STUDENT";
  } else if (
    state.questionCount === state.targetCount &&
    state.aiTurnCount === state.targetCount - 1
  ) {
    expectedNextActor = "COMPLETE";
  } else if (state.questionCount === state.aiTurnCount) {
    expectedNextActor = "STUDENT";
  } else if (
    state.questionCount === state.aiTurnCount + 1 &&
    state.questionCount < state.targetCount
  ) {
    expectedNextActor = "AI";
  } else {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }

  if (state.nextActor !== expectedNextActor) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
}

export function createRelayState(input: QuestionGameRunCreateStateInput): RelayRunState {
  return {
    game: "relay",
    topicHash: input.topicHash,
    topicLength: input.topicLength,
    locale: input.locale,
    questionCount: 0,
    aiTurnCount: 0,
    activitySequence: 0,
    nextActor: "STUDENT",
    targetCount: QUESTION_GAME_RULES.relay.targets.solo.count,
    questionHashes: [],
  };
}

function relayState(value: unknown): RelayRunState {
  return parseRelayState(value as Prisma.JsonValue);
}

export const relayRunDefinition: QuestionGameRunDefinition = {
  gameId: "relay",
  createState: createRelayState,
  parseState: parseRelayState,
  ensureProgress(state: unknown, context: QuestionGameRunProgressContext) {
    ensureRelayProgress(
      relayState(state),
      context.mode,
      context.runVersion,
      context.activeRun,
    );
  },
  publicProgress(state: unknown, mode: QuestionGameRunMode) {
    const relay = relayState(state);
    return {
      questionCount: relay.questionCount,
      aiTurnCount: relay.aiTurnCount,
      awaitingAiTurn: mode === "AI" && relay.nextActor === "AI",
      targetCount: relay.targetCount,
    };
  },
  clearTransientState(state: unknown) {
    const relay = relayState(state);
    const cleared = { ...relay };
    delete cleared.aiGenerationLease;
    return cleared;
  },
  result(state: unknown) {
    return relayState(state).result;
  },
};
