import type { Prisma } from "@prisma/client";
import { DAILY_LIMITS } from "@/lib/points-policy";

export const QUESTION_GAME_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type QuestionGameRunMode = "SOLO" | "AI";
export type QuestionGameRunLocale = "ko" | "en";

export interface QuestionGameRunResult {
  awarded: number;
  dailyLimit: number;
  dailyRemaining: number;
  cappedByLimit: boolean;
  preview: boolean;
}

export interface EncryptedQuestionGameAiTurnResponse {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface QuestionGameAiGenerationLease {
  id: string;
  generationRequestId: string;
  runVersion: number;
  expiresAt: number;
  issuedResponse?: EncryptedQuestionGameAiTurnResponse;
}

export interface QuestionGameRunCreateStateInput {
  mode: QuestionGameRunMode;
  locale: QuestionGameRunLocale;
  topicHash: string;
  topicLength: number;
  topicHashes?: string[];
  difficulty?: "easy" | "normal" | "hard";
}

export interface QuestionGameRunProgressContext {
  mode: QuestionGameRunMode;
  runVersion: number;
  activeRun?: boolean;
}

export interface QuestionGameRunPublicProgress {
  questionCount: number;
  aiTurnCount: number;
  awaitingAiTurn: boolean;
  targetCount: number;
  ladderRound?: 1 | 2 | 3 | null;
  ladderGrid?: boolean[][] | null;
  correctCount?: number;
  currentSentence?: string | null;
  kabaNextStep?: "STUDENT_ATTEMPT" | "COMPLETE";
  storyDiceNextStep?:
    | "ROLL"
    | "STORY"
    | "STUDENT_QUESTION"
    | "AI_QUESTION"
    | "STUDENT_ANSWER"
    | "COMPLETE";
  storyWordPool?: {
    protagonist: string[];
    place: string[];
    event: string[];
  };
  storyRolledWords?: {
    protagonist: string;
    place: string;
    event: string;
  } | null;
  memoryNextStep?:
    | "STUDENT_QUESTION"
    | "STUDENT_ANSWER"
    | "AI_TURN"
    | "RESOLVE_MISS"
    | "COMPLETE";
  memoryDifficulty?: "easy" | "normal" | "hard";
  studentMatchCount?: number;
  aiMatchCount?: number;
  memoryQuestionCards?: Array<{
    id: string;
    type: "q";
    state: "HIDDEN" | "REVEALED" | "TAKEN";
    contentKey?: string;
  }>;
  memoryAnswerCards?: Array<{
    id: string;
    type: "a";
    state: "HIDDEN" | "REVEALED" | "TAKEN";
    contentKey?: string;
  }>;
  memoryMissReveal?: {
    id: string;
    actor: "STUDENT" | "AI";
    result: "MISS";
    resolveAt: number;
  } | null;
  memoryReview?: Array<{ contentKey: string }> | null;
}

export interface QuestionGameRunDefinition {
  readonly gameId: string;
  createState(input: QuestionGameRunCreateStateInput): unknown;
  parseState(value: Prisma.JsonValue): unknown;
  ensureProgress(state: unknown, context: QuestionGameRunProgressContext): void;
  publicProgress(
    state: unknown,
    mode: QuestionGameRunMode,
  ): QuestionGameRunPublicProgress;
  clearTransientState(state: unknown): unknown;
  result(state: unknown): QuestionGameRunResult | undefined;
}

export class QuestionGameRunError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "QuestionGameRunError";
  }
}

export function isQuestionGameRunRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseQuestionGameRunResult(
  value: unknown,
): QuestionGameRunResult | undefined {
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

function parseEncryptedQuestionGameAiTurnResponse(
  value: unknown,
): EncryptedQuestionGameAiTurnResponse | undefined {
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

export function parseQuestionGameAiGenerationLease(
  value: unknown,
): QuestionGameAiGenerationLease | undefined {
  if (value === undefined) return undefined;
  if (
    !isQuestionGameRunRecord(value) ||
    typeof value.id !== "string" ||
    !QUESTION_GAME_REQUEST_ID_PATTERN.test(value.id) ||
    typeof value.generationRequestId !== "string" ||
    !QUESTION_GAME_REQUEST_ID_PATTERN.test(value.generationRequestId) ||
    typeof value.runVersion !== "number" ||
    !Number.isSafeInteger(value.runVersion) ||
    value.runVersion < 1 ||
    typeof value.expiresAt !== "number" ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt < 1
  ) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  const issuedResponse = parseEncryptedQuestionGameAiTurnResponse(value.issuedResponse);
  return {
    id: value.id,
    generationRequestId: value.generationRequestId,
    runVersion: value.runVersion,
    expiresAt: value.expiresAt,
    ...(issuedResponse ? { issuedResponse } : {}),
  };
}
