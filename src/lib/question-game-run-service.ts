import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
} from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  AI_POINTS,
  DAILY_LIMITS,
  SOLO_POINTS,
  normalizeQuestionActivity,
} from "@/lib/points-policy";
import { checkProfanity } from "@/lib/profanity";
import {
  QuestionGameAiProofError,
  issueQuestionGameAiProof,
  verifyQuestionGameAiProof,
} from "@/lib/question-game-ai-proof";
import { isQuestionFormForLocale } from "@/lib/question-game-i18n";
import {
  isQuestionGameRunRecord as isRecord,
  QUESTION_GAME_REQUEST_ID_PATTERN,
  QuestionGameRunError,
  type EncryptedQuestionGameAiTurnResponse as EncryptedAiTurnResponse,
  type QuestionGameAiGenerationLease,
  type QuestionGameRunLocale as RunLocale,
  type QuestionGameRunMode as RunMode,
  type QuestionGameRunResult as RelayRunResult,
} from "@/lib/question-game-run-definition";
import { findQuestionGameRunDefinition } from "@/lib/question-game-run-definitions";
import {
  ensureDiceProgress,
  parseDiceState,
  type DiceActor,
  type DiceRunState,
} from "@/lib/question-game-dice-definition";
import {
  ensureLadderProgress,
  ladderDestination,
  parseLadderState,
  type LadderRunState,
} from "@/lib/question-game-ladder-definition";
import {
  ensureRelayProgress,
  parseRelayState,
  type RelayRunState,
} from "@/lib/question-game-relay-definition";
import { QUESTION_GAME_LIMITS } from "@/lib/question-game-rules";

const RUN_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAX_ACTIVE_RUNS_PER_USER = 3;
const MIN_ACTIVITY_HASH_SECRET_LENGTH = 32;
const AI_GENERATION_LEASE_MS = 90 * 1_000;
const RELAY_ACTIVITY_TYPE = "RELAY_QUESTION";
const RELAY_AI_ACTIVITY_TYPE = "RELAY_AI_TURN";
const DICE_ROLL_ACTIVITY_TYPE = "DICE_ROLL";
const DICE_QUESTION_ACTIVITY_TYPE = "DICE_QUESTION";
const DICE_AI_QUESTION_ACTIVITY_TYPE = "DICE_AI_QUESTION";
const LADDER_QUESTION_ACTIVITY_TYPE = "LADDER_QUESTION";
const COMPLETE_ACTIVITY_TYPE = "RUN_COMPLETE";

type ActorRole = "STUDENT" | "TEACHER";

export interface PreparedQuestionGameAiTurn {
  gameId: "relay" | "dice";
  runId: string;
  ownerId: string;
  runVersion: number;
  leaseId: string;
  generationRequestId: string;
  topic: string;
  previousQuestion: string;
  locale: RunLocale;
  topicHash: string;
  previousQuestionHash: string;
  diceFace?: number;
  cachedResponse?: QuestionGameAiTurnResponse;
}

export interface QuestionGameAiTurnResponse {
  output: string;
  proof: string;
  proofId: string;
  expiresAt: string;
  runVersion: number;
}

interface RelaySettlement {
  run: StoredRun;
  result: RelayRunResult;
  verifiedQuestionCount: number;
  verifiedAiTurnCount: number;
  scoreDate: string;
}

type StoredRun = {
  id: string;
  gameId: string;
  mode: string;
  ownerId: string | null;
  creationRequestId: string;
  creationRequestFingerprint: string;
  status: string;
  state: Prisma.JsonValue;
  version: number;
  scoreDate: string | null;
  completedAt: Date | null;
  settledAt: Date | null;
  expiresAt: Date;
};

type RunTransaction = Prisma.TransactionClient;

export { QuestionGameRunError };

function requireRequestId(value: unknown): string {
  if (typeof value !== "string" || !QUESTION_GAME_REQUEST_ID_PATTERN.test(value)) {
    throw new QuestionGameRunError("요청 식별값이 올바르지 않습니다", 400);
  }
  return value;
}

function requireVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new QuestionGameRunError("실행 버전이 올바르지 않습니다", 400);
  }
  return value;
}

function parseMode(value: unknown): RunMode {
  if (value === "solo" || value === "SOLO") return "SOLO";
  if (value === "ai" || value === "AI") return "AI";
  throw new QuestionGameRunError("놀이 모드가 올바르지 않습니다", 400);
}

function parseLocale(value: unknown): RunLocale {
  if (value === "ko" || value === "en") return value;
  throw new QuestionGameRunError("질문 언어값이 올바르지 않습니다", 400);
}

function storedRunMode(value: string): RunMode {
  if (value === "SOLO" || value === "AI") return value;
  throw new QuestionGameRunError("질문놀이 실행 모드가 손상되었습니다", 409);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function activityHashSecret(): string {
  const secret = process.env.GAME_ACTIVITY_HASH_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (secret && (!isProduction || secret.length >= MIN_ACTIVITY_HASH_SECRET_LENGTH)) return secret;
  if (isProduction) {
    throw new QuestionGameRunError("질문놀이 활동 보호 설정이 필요합니다", 503);
  }
  return "question-game-local-development-secret";
}

function hashActivityText(
  scope: "topic" | "question" | "ai-output" | "ai-context",
  text: string,
): string {
  return createHmac("sha256", activityHashSecret())
    .update(`${scope}\0${normalizeQuestionActivity(text)}`)
    .digest("hex");
}

function diceAiContextHash(face: number): string {
  return hashActivityText("ai-context", `dice-face:${face}`);
}

function aiTurnCacheEncryptionKey(): Buffer {
  return createHmac("sha256", activityHashSecret())
    .update("question-game-ai-turn-cache-encryption-v1")
    .digest();
}

function aiTurnCacheAad(input: {
  runId: string;
  ownerId: string;
  runVersion: number;
  leaseId: string;
  generationRequestId: string;
}): Buffer {
  return Buffer.from([
    "question-game-ai-turn-cache-v1",
    input.runId,
    input.ownerId,
    String(input.runVersion),
    input.leaseId,
    input.generationRequestId,
  ].join("\0"), "utf8");
}

function encryptAiTurnResponse(
  response: QuestionGameAiTurnResponse,
  prepared: PreparedQuestionGameAiTurn,
): EncryptedAiTurnResponse {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aiTurnCacheEncryptionKey(), iv);
  cipher.setAAD(aiTurnCacheAad(prepared));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(response), "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

function decryptAiTurnResponse(
  encrypted: EncryptedAiTurnResponse,
  prepared: PreparedQuestionGameAiTurn,
): unknown {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      aiTurnCacheEncryptionKey(),
      Buffer.from(encrypted.iv, "base64url"),
    );
    decipher.setAAD(aiTurnCacheAad(prepared));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as unknown;
  } catch {
    throw new QuestionGameRunError("인공지능 질문 재생 자료가 손상되었습니다", 409);
  }
}

function validateTopic(value: unknown): { topic: string; topicLength: number } {
  const topic = typeof value === "string" ? value.trim() : "";
  const topicLength = [...topic].length;
  if (!topic || topicLength > QUESTION_GAME_LIMITS.topic) {
    throw new QuestionGameRunError("주제는 팔십 자 안으로 입력해 주세요", 400);
  }
  if (checkProfanity(topic).flagged) {
    throw new QuestionGameRunError("주제에 사용할 수 없는 표현이 있습니다", 400);
  }
  return { topic, topicLength };
}

function validateLadderTopics(value: unknown, mode: RunMode) {
  const expectedCount = mode === "SOLO" ? 4 : 2;
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new QuestionGameRunError(
      `질문 사다리 주제를 ${expectedCount}개 입력해 주세요`,
      400,
    );
  }
  const topics = value.map((item) => validateTopic(item));
  const topicHashes = topics.map(({ topic }) => hashActivityText("topic", topic));
  return {
    topicHashes,
    topicHash: fingerprint(topicHashes),
    topicLength: topics.reduce((sum, topic) => sum + topic.topicLength, 0),
  };
}

function validateQuestionText(value: unknown, locale: RunLocale) {
  const question = typeof value === "string" ? value.trim() : "";
  const questionLength = [...question].length;
  if (!question || questionLength > QUESTION_GAME_LIMITS.question) {
    throw new QuestionGameRunError("질문은 이백 자 안으로 입력해 주세요", 400);
  }
  const meaningfulCharacterCount = question.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  if (meaningfulCharacterCount < 2) {
    throw new QuestionGameRunError("질문에는 글자나 숫자를 두 글자 이상 넣어 주세요", 400);
  }
  if (!isQuestionFormForLocale(question, locale)) {
    throw new QuestionGameRunError("질문 형태로 입력해 주세요", 400);
  }
  if (checkProfanity(question).flagged) {
    throw new QuestionGameRunError("질문에 사용할 수 없는 표현이 있습니다", 400);
  }
  return { question, questionLength };
}

function publicRun(run: StoredRun) {
  const definition = findQuestionGameRunDefinition(run.gameId);
  if (!definition) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  const state = definition.parseState(run.state);
  const mode = storedRunMode(run.mode);
  definition.ensureProgress(state, {
    mode,
    runVersion: run.version,
    activeRun: run.status === "ACTIVE",
  });
  const progress = definition.publicProgress(state, mode);
  const result = definition.result(state);
  return {
    id: run.id,
    gameId: run.gameId,
    mode,
    status: run.status,
    version: run.version,
    ...progress,
    preview: run.ownerId !== null && result?.preview === true,
    expiresAt: run.expiresAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

function publicRunWithRole(run: StoredRun, role: ActorRole) {
  return { ...publicRun(run), preview: role === "TEACHER" };
}

function replaySnapshot(value: Prisma.JsonValue): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new QuestionGameRunError("저장된 요청 결과가 손상되었습니다", 409);
  }
  return value;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readCachedAiTurnResponse(
  encrypted: EncryptedAiTurnResponse,
  prepared: PreparedQuestionGameAiTurn,
  now: Date,
): QuestionGameAiTurnResponse {
  const value = decryptAiTurnResponse(encrypted, prepared);
  if (!isRecord(value)) {
    throw new QuestionGameRunError("인공지능 질문 재생 자료가 손상되었습니다", 409);
  }
  const { output, proof, proofId, expiresAt, runVersion } = value;
  if (
    typeof output !== "string" ||
    typeof proof !== "string" ||
    !proof ||
    proof.length > 4_096 ||
    typeof proofId !== "string" ||
    !QUESTION_GAME_REQUEST_ID_PATTERN.test(proofId) ||
    typeof expiresAt !== "string" ||
    typeof runVersion !== "number" ||
    runVersion !== prepared.runVersion
  ) {
    throw new QuestionGameRunError("인공지능 질문 재생 자료가 손상되었습니다", 409);
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isSafeInteger(expiresAtMs) || new Date(expiresAtMs).toISOString() !== expiresAt) {
    throw new QuestionGameRunError("인공지능 질문 재생 자료가 손상되었습니다", 409);
  }
  const { question } = validateQuestionText(output, prepared.locale);
  let proofPayload;
  try {
    proofPayload = verifyQuestionGameAiProof(proof, activityHashSecret(), now);
  } catch (error) {
    if (error instanceof QuestionGameAiProofError) {
      throw new QuestionGameRunError("인공지능 질문 재생 자료가 만료되었거나 손상되었습니다", 409);
    }
    throw error;
  }
  if (
    proofPayload.proofId !== proofId ||
    proofPayload.expiresAt !== expiresAtMs ||
    proofPayload.runId !== prepared.runId ||
    proofPayload.ownerId !== prepared.ownerId ||
    proofPayload.runVersion !== prepared.runVersion ||
    proofPayload.leaseId !== prepared.leaseId ||
    proofPayload.generationRequestId !== prepared.generationRequestId ||
    proofPayload.topicHash !== prepared.topicHash ||
    proofPayload.previousQuestionHash !== prepared.previousQuestionHash ||
    proofPayload.outputHash !== hashActivityText("ai-output", question)
  ) {
    throw new QuestionGameRunError("인공지능 질문 재생 자료가 손상되었습니다", 409);
  }
  return { output: question, proof, proofId, expiresAt, runVersion };
}

async function loadActor(
  tx: RunTransaction,
  actorId: string,
  lock: "share" | "update" = "share",
): Promise<{ id: string; role: ActorRole }> {
  if (lock === "update") {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${actorId} FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${actorId} FOR SHARE`;
  }
  const user = await tx.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true },
  });
  if (!user || (user.role !== "STUDENT" && user.role !== "TEACHER")) {
    throw new QuestionGameRunError("질문놀이 실행 권한이 없습니다", 403);
  }
  return { id: user.id, role: user.role };
}

async function loadOwnedRun(
  tx: RunTransaction,
  actorId: string,
  runId: string,
): Promise<StoredRun> {
  await tx.$queryRaw`SELECT "id" FROM "game_runs" WHERE "id" = ${runId} FOR UPDATE`;
  const run = await tx.gameRun.findUnique({ where: { id: runId } });
  if (!run) throw new QuestionGameRunError("질문놀이 실행을 찾을 수 없습니다", 404);
  if (run.ownerId !== actorId) {
    throw new QuestionGameRunError("자신의 질문놀이 실행만 이용할 수 있습니다", 403);
  }
  return run as StoredRun;
}

function ensureActive(run: StoredRun, now: Date) {
  if (run.status !== "ACTIVE") {
    throw new QuestionGameRunError("이미 끝난 질문놀이 실행입니다", 409);
  }
  if (run.expiresAt.getTime() <= now.getTime()) {
    throw new QuestionGameRunError("질문놀이 실행 시간이 만료되었습니다", 409);
  }
}

async function expireRunForRead(
  tx: RunTransaction,
  run: StoredRun,
  now: Date,
): Promise<StoredRun> {
  if (run.status !== "ACTIVE" || run.expiresAt.getTime() > now.getTime()) return run;
  const definition = findQuestionGameRunDefinition(run.gameId);
  if (!definition) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  const state = definition.parseState(run.state);
  const expiredState = definition.clearTransientState(state);
  const expired = await tx.gameRun.update({
    where: { id: run.id },
    data: {
      status: "EXPIRED",
      state: toJson(expiredState),
      version: run.version + 1,
      updatedAt: now,
    },
  });
  return expired as StoredRun;
}

function transactionRetryable(error: unknown) {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "";
  return code === "P2002" || code === "P2034";
}

async function serializable<T>(operation: (tx: RunTransaction) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      lastError = error;
      if (!transactionRetryable(error)) throw error;
      if (attempt === 2) {
        throw new QuestionGameRunError(
          "질문놀이 실행이 동시에 변경되었습니다. 다시 시도해 주세요",
          409,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 20 : 50));
    }
  }
  throw lastError;
}

async function lockedDatabaseClock(tx: RunTransaction): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`
    SELECT clock_timestamp() AS "now"
  `;
  const now = rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new QuestionGameRunError("질문놀이 완료 시각을 확인할 수 없습니다", 500);
  }
  return now;
}

function seoulDayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

function seoulDayBounds(now: Date) {
  const day = seoulDayKey(now);
  const start = new Date(`${day}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
  return { day, start, end };
}

async function awardVerifiedQuestionGameRun(
  tx: RunTransaction,
  actor: { id: string; role: ActorRole },
  run: StoredRun,
  mode: RunMode,
  completedAt: Date,
  verifiedQuestionCount: number,
) {
  const policy = mode === "SOLO" ? SOLO_POINTS : AI_POINTS;
  const dailyLimit = mode === "SOLO" ? DAILY_LIMITS.SOLO : DAILY_LIMITS.AI;
  const modeKey = mode === "SOLO" ? "ACTIVITY_SOLO" : "ACTIVITY_AI";
  const requested =
    verifiedQuestionCount * policy.PER_VALID_QUESTION + policy.COMPLETION;
  const { day, start, end } = seoulDayBounds(completedAt);
  let awarded = 0;
  let earnedToday = 0;

  if (actor.role === "STUDENT") {
    const aggregate = await tx.pointLog.aggregate({
      where: {
        studentId: actor.id,
        gameId: modeKey,
        status: { in: ["PENDING", "APPROVED"] },
        createdAt: { gte: start, lt: end },
      },
      _sum: { points: true },
    });
    earnedToday = aggregate._sum.points ?? 0;
    awarded = Math.max(0, Math.min(requested, dailyLimit - earnedToday));
    if (awarded > 0) {
      await tx.pointLog.create({
        data: {
          studentId: actor.id,
          gameId: modeKey,
          gameRunId: run.id,
          roomCode: `run:${run.id}`,
          bonusType: `${modeKey}_${run.gameId}`,
          points: awarded,
          reason: "서버 확인 질문놀이 완료",
          status: "APPROVED",
          createdAt: completedAt,
        },
      });
      await tx.user.update({
        where: { id: actor.id },
        data: { totalPoints: { increment: awarded } },
      });
    }
  }

  const result: RelayRunResult = {
    awarded,
    dailyLimit,
    dailyRemaining: Math.max(0, dailyLimit - earnedToday - awarded),
    cappedByLimit: actor.role === "STUDENT" && awarded < requested,
    preview: actor.role === "TEACHER",
  };
  return { day, result };
}

async function settleRelayRun(
  tx: RunTransaction,
  actor: { id: string; role: ActorRole },
  run: StoredRun,
  state: RelayRunState,
  mode: RunMode,
  completedAt: Date,
  pendingValidQuestionCount = 0,
): Promise<RelaySettlement> {
  if (state.nextActor !== "COMPLETE" || state.result) {
    throw new QuestionGameRunError("질문놀이의 정해진 차례를 모두 마쳐 주세요", 409);
  }
  const activity = await tx.gameActivity.aggregate({
    where: { runId: run.id, type: RELAY_ACTIVITY_TYPE },
    _sum: { validQuestionCount: true },
  });
  const verifiedQuestionCount =
    (activity._sum.validQuestionCount ?? 0) + pendingValidQuestionCount;
  if (
    verifiedQuestionCount !== state.questionCount ||
    verifiedQuestionCount < state.targetCount
  ) {
    throw new QuestionGameRunError("서버에서 목표 질문 수 완료를 확인할 수 없습니다", 409);
  }
  const verifiedAiTurnCount = mode === "AI"
    ? await tx.gameActivity.count({
        where: { runId: run.id, type: RELAY_AI_ACTIVITY_TYPE },
      })
    : 0;
  if (
    verifiedAiTurnCount !== state.aiTurnCount ||
    (mode === "AI" && verifiedAiTurnCount !== state.targetCount - 1) ||
    (mode === "SOLO" && verifiedAiTurnCount !== 0)
  ) {
    throw new QuestionGameRunError("서버에서 인공지능 질문 차례를 확인할 수 없습니다", 409);
  }

  const { day, result } = await awardVerifiedQuestionGameRun(
    tx,
    actor,
    run,
    mode,
    completedAt,
    verifiedQuestionCount,
  );
  const settledState: RelayRunState = {
    ...state,
    questionHashes: [],
    result,
  };
  const nextRun = await tx.gameRun.update({
    where: { id: run.id },
    data: {
      status: "SETTLED",
      state: toJson(settledState),
      version: run.version + 1,
      scoreDate: day,
      completedAt,
      settledAt: completedAt,
    },
  });
  return {
    run: nextRun as StoredRun,
    result,
    verifiedQuestionCount,
    verifiedAiTurnCount,
    scoreDate: day,
  };
}

interface PendingDiceQuestionEvidence {
  sequence: number;
  face: number;
  questionHash: string;
}

async function verifyDiceActivitySequence(
  tx: RunTransaction,
  run: StoredRun,
  state: DiceRunState,
  mode: RunMode,
  pendingQuestion?: PendingDiceQuestionEvidence,
) {
  const stored = await tx.gameActivity.findMany({
    where: {
      runId: run.id,
      type: {
        in: [
          DICE_ROLL_ACTIVITY_TYPE,
          DICE_QUESTION_ACTIVITY_TYPE,
          DICE_AI_QUESTION_ACTIVITY_TYPE,
        ],
      },
    },
    orderBy: { sequence: "asc" },
    select: {
      sequence: true,
      type: true,
      payload: true,
      validQuestionCount: true,
    },
  });
  const evidence = pendingQuestion
    ? [
        ...stored,
        {
          sequence: pendingQuestion.sequence,
          type: DICE_QUESTION_ACTIVITY_TYPE,
          payload: {
            actor: "STUDENT",
            face: pendingQuestion.face,
            questionHash: pendingQuestion.questionHash,
          },
          validQuestionCount: 1,
        },
      ]
    : stored;
  if (evidence.length !== state.activitySequence || evidence.length % 2 !== 0) {
    throw new QuestionGameRunError("서버에서 질문 주사위 활동 순서를 확인할 수 없습니다", 409);
  }

  let verifiedQuestionCount = 0;
  let verifiedAiTurnCount = 0;
  const verifiedQuestionHashes: string[] = [];
  for (let index = 0; index < evidence.length; index += 2) {
    const roll = evidence[index];
    const question = evidence[index + 1];
    const turnIndex = index / 2;
    const expectedActor: DiceActor = mode === "AI" && turnIndex % 2 === 1
      ? "AI"
      : "STUDENT";
    const expectedQuestionType = expectedActor === "STUDENT"
      ? DICE_QUESTION_ACTIVITY_TYPE
      : DICE_AI_QUESTION_ACTIVITY_TYPE;
    const rollPayload = isRecord(roll?.payload) ? roll.payload : null;
    const questionPayload = isRecord(question?.payload) ? question.payload : null;
    if (
      roll?.sequence !== index + 1 ||
      question?.sequence !== index + 2 ||
      roll.type !== DICE_ROLL_ACTIVITY_TYPE ||
      question.type !== expectedQuestionType ||
      roll.validQuestionCount !== 0 ||
      question.validQuestionCount !== (expectedActor === "STUDENT" ? 1 : 0) ||
      !rollPayload ||
      !questionPayload ||
      rollPayload.actor !== expectedActor ||
      questionPayload.actor !== expectedActor ||
      typeof rollPayload.face !== "number" ||
      !Number.isSafeInteger(rollPayload.face) ||
      rollPayload.face < 1 ||
      rollPayload.face > 6 ||
      questionPayload.face !== rollPayload.face ||
      (expectedActor === "STUDENT" &&
        (typeof questionPayload.questionHash !== "string" ||
          !/^[0-9a-f]{64}$/.test(questionPayload.questionHash)))
    ) {
      throw new QuestionGameRunError("서버에서 질문 주사위 활동 순서를 확인할 수 없습니다", 409);
    }
    if (expectedActor === "STUDENT") {
      verifiedQuestionCount += 1;
      verifiedQuestionHashes.push(questionPayload.questionHash as string);
    } else {
      verifiedAiTurnCount += 1;
    }
  }

  if (
    verifiedQuestionCount !== state.questionCount ||
    verifiedQuestionCount !== state.targetCount ||
    verifiedQuestionHashes.some((hash, index) => hash !== state.questionHashes[index]) ||
    verifiedAiTurnCount !== state.aiTurnCount ||
    (mode === "AI" && verifiedAiTurnCount !== state.targetCount - 1) ||
    (mode === "SOLO" && verifiedAiTurnCount !== 0)
  ) {
    throw new QuestionGameRunError("서버에서 질문 주사위 완료를 확인할 수 없습니다", 409);
  }
  return { verifiedQuestionCount, verifiedAiTurnCount };
}

async function settleDiceRun(
  tx: RunTransaction,
  actor: { id: string; role: ActorRole },
  run: StoredRun,
  state: DiceRunState,
  mode: RunMode,
  completedAt: Date,
  pendingQuestion?: PendingDiceQuestionEvidence,
): Promise<RelaySettlement> {
  if (state.nextStep !== "COMPLETE" || state.result) {
    throw new QuestionGameRunError("질문놀이의 정해진 차례를 모두 마쳐 주세요", 409);
  }
  const { verifiedQuestionCount, verifiedAiTurnCount } =
    await verifyDiceActivitySequence(tx, run, state, mode, pendingQuestion);
  const { day, result } = await awardVerifiedQuestionGameRun(
    tx,
    actor,
    run,
    mode,
    completedAt,
    verifiedQuestionCount,
  );
  const settledState: DiceRunState = {
    ...state,
    questionHashes: [],
    result,
  };
  const nextRun = await tx.gameRun.update({
    where: { id: run.id },
    data: {
      status: "SETTLED",
      state: toJson(settledState),
      version: run.version + 1,
      scoreDate: day,
      completedAt,
      settledAt: completedAt,
    },
  });
  return {
    run: nextRun as StoredRun,
    result,
    verifiedQuestionCount,
    verifiedAiTurnCount,
    scoreDate: day,
  };
}

interface PendingLadderQuestionEvidence {
  sequence: number;
  round: number;
  startColumn: number;
  destinationColumn: number;
  topicHash: string;
  locale: RunLocale;
  questionHash: string;
}

async function verifyLadderActivitySequence(
  tx: RunTransaction,
  run: StoredRun,
  state: LadderRunState,
  pendingQuestion?: PendingLadderQuestionEvidence,
) {
  const stored = await tx.gameActivity.findMany({
    where: {
      runId: run.id,
      type: { in: [LADDER_QUESTION_ACTIVITY_TYPE] },
    },
    orderBy: { sequence: "asc" },
    select: {
      sequence: true,
      type: true,
      payload: true,
      validQuestionCount: true,
    },
  });
  const evidence = pendingQuestion
    ? [
        ...stored,
        {
          sequence: pendingQuestion.sequence,
          type: LADDER_QUESTION_ACTIVITY_TYPE,
          payload: pendingQuestion,
          validQuestionCount: 1,
        },
      ]
    : stored;
  if (evidence.length !== state.activitySequence) {
    throw new QuestionGameRunError("서버에서 질문 사다리 활동 순서를 확인할 수 없습니다", 409);
  }

  const verifiedQuestionHashes: string[] = [];
  for (let index = 0; index < evidence.length; index += 1) {
    const activity = evidence[index];
    const payload = isRecord(activity?.payload) ? activity.payload : null;
    const grid = state.grids[index];
    let expectedDestination = -1;
    if (payload && grid && typeof payload.startColumn === "number") {
      try {
        expectedDestination = ladderDestination(payload.startColumn, grid);
      } catch {
        expectedDestination = -1;
      }
    }
    const expectedTopicHash = state.topicHashes[expectedDestination];
    if (
      activity?.sequence !== index + 1 ||
      activity.type !== LADDER_QUESTION_ACTIVITY_TYPE ||
      activity.validQuestionCount !== 1 ||
      !payload ||
      payload.round !== index + 1 ||
      typeof payload.startColumn !== "number" ||
      !Number.isSafeInteger(payload.startColumn) ||
      payload.destinationColumn !== expectedDestination ||
      typeof expectedTopicHash !== "string" ||
      payload.topicHash !== expectedTopicHash ||
      payload.locale !== state.locale ||
      typeof payload.questionHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(payload.questionHash) ||
      payload.questionHash !== state.questionHashes[index]
    ) {
      throw new QuestionGameRunError("서버에서 질문 사다리 활동 순서를 확인할 수 없습니다", 409);
    }
    verifiedQuestionHashes.push(payload.questionHash);
  }

  if (
    verifiedQuestionHashes.length !== state.questionCount ||
    verifiedQuestionHashes.length !== state.targetCount
  ) {
    throw new QuestionGameRunError("서버에서 질문 사다리 완료를 확인할 수 없습니다", 409);
  }
  return { verifiedQuestionCount: verifiedQuestionHashes.length, verifiedAiTurnCount: 0 };
}

async function settleLadderRun(
  tx: RunTransaction,
  actor: { id: string; role: ActorRole },
  run: StoredRun,
  state: LadderRunState,
  mode: RunMode,
  completedAt: Date,
  pendingQuestion?: PendingLadderQuestionEvidence,
): Promise<RelaySettlement> {
  if (state.nextStep !== "COMPLETE" || state.result) {
    throw new QuestionGameRunError("질문놀이의 정해진 차례를 모두 마쳐 주세요", 409);
  }
  const { verifiedQuestionCount, verifiedAiTurnCount } =
    await verifyLadderActivitySequence(tx, run, state, pendingQuestion);
  const { day, result } = await awardVerifiedQuestionGameRun(
    tx,
    actor,
    run,
    mode,
    completedAt,
    verifiedQuestionCount,
  );
  const settledState: LadderRunState = {
    ...state,
    questionHashes: [],
    result,
  };
  const nextRun = await tx.gameRun.update({
    where: { id: run.id },
    data: {
      status: "SETTLED",
      state: toJson(settledState),
      version: run.version + 1,
      scoreDate: day,
      completedAt,
      settledAt: completedAt,
    },
  });
  return {
    run: nextRun as StoredRun,
    result,
    verifiedQuestionCount,
    verifiedAiTurnCount,
    scoreDate: day,
  };
}

export async function createQuestionGameRun(actorId: string, input: unknown, now = new Date()) {
  if (!isRecord(input)) throw new QuestionGameRunError("요청 본문이 올바르지 않습니다", 400);
  const requestId = requireRequestId(input.requestId);
  const mode = parseMode(input.mode);
  const gameId = typeof input.gameId === "string" ? input.gameId : "";
  if (!gameId) throw new QuestionGameRunError("질문놀이 식별값이 필요합니다", 400);
  const locale = parseLocale(input.locale);
  let topicHash: string;
  let topicLength: number;
  let topicHashes: string[] | undefined;
  if (gameId === "dice") {
    topicHash = hashActivityText("topic", "dice");
    topicLength = 0;
  } else if (gameId === "ladder") {
    const ladderTopics = validateLadderTopics(input.topics, mode);
    topicHash = ladderTopics.topicHash;
    topicLength = ladderTopics.topicLength;
    topicHashes = ladderTopics.topicHashes;
  } else {
    const topic = validateTopic(input.topic);
    topicHash = hashActivityText("topic", topic.topic);
    topicLength = topic.topicLength;
  }
  const requestFingerprint = fingerprint({ gameId, mode, locale, topicHash });

  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId, "update");
    const existing = await tx.gameRun.findFirst({
      where: { ownerId: actor.id, creationRequestId: requestId },
    });
    if (existing) {
      if (existing.creationRequestFingerprint !== requestFingerprint) {
        throw new QuestionGameRunError("같은 요청 식별값에 다른 실행 정보가 들어왔습니다", 409);
      }
      const replayRun = await expireRunForRead(tx, existing as StoredRun, now);
      return { run: publicRunWithRole(replayRun, actor.role), replayed: true };
    }
    const definition = findQuestionGameRunDefinition(gameId);
    if (!definition) {
      throw new QuestionGameRunError(
        "이 질문놀이는 서버 점수 기록을 아직 지원하지 않습니다",
        409,
        { unsupported: true },
      );
    }
    const activeWhere = {
      ownerId: actor.id,
      status: "ACTIVE",
      expiresAt: { gt: now },
    } as const;
    const activeRunCount = await tx.gameRun.count({ where: activeWhere });
    if (activeRunCount >= MAX_ACTIVE_RUNS_PER_USER) {
      const oldestRuns = await tx.gameRun.findMany({
        where: activeWhere,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: activeRunCount - MAX_ACTIVE_RUNS_PER_USER + 1,
      });
      if (oldestRuns.length !== activeRunCount - MAX_ACTIVE_RUNS_PER_USER + 1) {
        throw new QuestionGameRunError("진행 중인 질문놀이 실행을 정리할 수 없습니다", 409);
      }
      for (const oldestRun of oldestRuns) {
        const oldestDefinition = findQuestionGameRunDefinition(oldestRun.gameId);
        if (!oldestDefinition) {
          throw new QuestionGameRunError("진행 중인 질문놀이 실행을 정리할 수 없습니다", 409);
        }
        const abandonedState = oldestDefinition.parseState(oldestRun.state);
        const stateWithoutTransient = oldestDefinition.clearTransientState(abandonedState);
        await tx.gameRun.update({
          where: { id: oldestRun.id },
          data: {
            status: "ABANDONED",
            state: toJson(stateWithoutTransient),
            version: oldestRun.version + 1,
          },
        });
      }
    }

    const state = definition.createState({
      mode,
      locale,
      topicHash,
      topicLength,
      ...(topicHashes ? { topicHashes } : {}),
    });
    const run = await tx.gameRun.create({
      data: {
        gameId,
        mode,
        ownerId: actor.id,
        creationRequestId: requestId,
        creationRequestFingerprint: requestFingerprint,
        roomLifetimeKey: null,
        participants: toJson([]),
        status: "ACTIVE",
        state: toJson(state),
        version: 1,
        scoreDate: null,
        completedAt: null,
        settledAt: null,
        expiresAt: new Date(now.getTime() + RUN_LIFETIME_MS),
      },
    });
    return { run: publicRunWithRole(run as StoredRun, actor.role), replayed: false };
  });
}

export async function prepareQuestionGameAiTurn(
  actorId: string,
  runId: string,
  input: unknown,
  now = new Date(),
): Promise<PreparedQuestionGameAiTurn> {
  if (!isRecord(input)) throw new QuestionGameRunError("요청 본문이 올바르지 않습니다", 400);
  const generationRequestId = requireRequestId(input.requestId);
  const expectedVersion = requireVersion(input.expectedVersion);
  const locale = parseLocale(input.locale);
  const suppliedTopic = input.topic === undefined ? undefined : validateTopic(input.topic).topic;
  const suppliedPreviousQuestion = input.previousQuestion === undefined
    ? undefined
    : validateQuestionText(input.previousQuestion, locale).question;

  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId);
    const run = await loadOwnedRun(tx, actor.id, runId);
    ensureActive(run, now);
    if (run.version !== expectedVersion) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.gameId !== "relay" && run.gameId !== "dice") {
      throw new QuestionGameRunError("이 질문놀이는 인공지능 차례를 지원하지 않습니다", 409, {
        unsupported: true,
      });
    }
    const mode = storedRunMode(run.mode);
    if (mode !== "AI") {
      throw new QuestionGameRunError("인공지능 도움 모드에서만 이용할 수 있습니다", 409);
    }
    let state: RelayRunState | DiceRunState;
    let topic: string;
    let previousQuestion: string;
    let topicHash: string;
    let previousQuestionHash: string;
    let diceFace: number | undefined;
    if (run.gameId === "relay") {
      topic = suppliedTopic ?? validateTopic(undefined).topic;
      previousQuestion = suppliedPreviousQuestion ?? validateQuestionText(undefined, locale).question;
      topicHash = hashActivityText("topic", topic);
      previousQuestionHash = hashActivityText("question", previousQuestion);
      state = parseRelayState(run.state);
      ensureRelayProgress(state, mode, run.version, run.status === "ACTIVE");
      if (state.nextActor !== "AI") {
        throw new QuestionGameRunError("지금은 인공지능 질문 차례가 아닙니다", 409);
      }
      if (state.locale !== locale) {
        throw new QuestionGameRunError("실행을 만든 언어로 질문해 주세요", 409);
      }
      if (state.topicHash !== topicHash) {
        throw new QuestionGameRunError("실행을 만든 주제가 일치하지 않습니다", 409);
      }
      if (state.questionHashes.at(-1) !== previousQuestionHash) {
        throw new QuestionGameRunError("직전 학생 질문이 실행 상태와 일치하지 않습니다", 409);
      }
    } else {
      state = parseDiceState(run.state);
      ensureDiceProgress(state, mode, run.version, run.status === "ACTIVE");
      if (state.nextStep !== "AI_QUESTION" || state.pendingRoll?.actor !== "AI") {
        throw new QuestionGameRunError("인공지능 주사위를 먼저 굴려 주세요", 409);
      }
      if (state.locale !== locale) {
        throw new QuestionGameRunError("실행을 만든 언어로 질문해 주세요", 409);
      }
      diceFace = state.pendingRoll.face;
      topic = "";
      previousQuestion = "";
      topicHash = hashActivityText("topic", "dice");
      previousQuestionHash = diceAiContextHash(diceFace);
    }
    if (
      state.aiGenerationLease &&
      state.aiGenerationLease.expiresAt > now.getTime()
    ) {
      const lease = state.aiGenerationLease;
      const prepared: PreparedQuestionGameAiTurn = {
        gameId: run.gameId,
        runId: run.id,
        ownerId: actor.id,
        runVersion: run.version,
        leaseId: lease.id,
        generationRequestId,
        topic,
        previousQuestion,
        locale,
        topicHash,
        previousQuestionHash,
        ...(diceFace ? { diceFace } : {}),
      };
      if (
        lease.generationRequestId === generationRequestId &&
        lease.issuedResponse
      ) {
        return {
          ...prepared,
          cachedResponse: readCachedAiTurnResponse(lease.issuedResponse, prepared, now),
        };
      }
      throw new QuestionGameRunError("인공지능 질문을 이미 만들고 있습니다", 409, {
        aiGenerationInProgress: true,
        retryAfterMs: lease.expiresAt - now.getTime(),
      });
    }
    const leaseId = randomUUID();
    const aiGenerationLease: QuestionGameAiGenerationLease = {
      id: leaseId,
      generationRequestId,
      runVersion: run.version,
      expiresAt: now.getTime() + AI_GENERATION_LEASE_MS,
    };
    await tx.gameRun.update({
      where: { id: run.id },
      data: {
        state: toJson({ ...state, aiGenerationLease }),
      },
    });

    return {
      gameId: run.gameId,
      runId: run.id,
      ownerId: actor.id,
      runVersion: run.version,
      leaseId,
      generationRequestId,
      topic,
      previousQuestion,
      locale,
      topicHash,
      previousQuestionHash,
      ...(diceFace ? { diceFace } : {}),
    };
  });
}

export async function issueQuestionGameAiTurn(
  prepared: PreparedQuestionGameAiTurn,
  generatedOutput: unknown,
  now = new Date(),
) {
  const { question: output } = validateQuestionText(generatedOutput, prepared.locale);
  const outputHash = hashActivityText("ai-output", output);
  const issued = issueQuestionGameAiProof({
    runId: prepared.runId,
    ownerId: prepared.ownerId,
    runVersion: prepared.runVersion,
    leaseId: prepared.leaseId,
    generationRequestId: prepared.generationRequestId,
    topicHash: prepared.topicHash,
    previousQuestionHash: prepared.previousQuestionHash,
    outputHash,
  }, activityHashSecret(), now);
  const response: QuestionGameAiTurnResponse = {
    output,
    proof: issued.proof,
    proofId: issued.proofId,
    expiresAt: issued.expiresAt.toISOString(),
    runVersion: prepared.runVersion,
  };
  const issuedResponse = encryptAiTurnResponse(response, prepared);
  await serializable(async (tx) => {
    const actor = await loadActor(tx, prepared.ownerId);
    const run = await loadOwnedRun(tx, actor.id, prepared.runId);
    ensureActive(run, now);
    if (run.version !== prepared.runVersion || run.gameId !== prepared.gameId) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    const mode = storedRunMode(run.mode);
    let state: RelayRunState | DiceRunState;
    let lease: QuestionGameAiGenerationLease | undefined;
    if (prepared.gameId === "relay") {
      state = parseRelayState(run.state);
      ensureRelayProgress(state, mode, run.version);
      lease = state.aiGenerationLease;
      if (
        mode !== "AI" ||
        state.nextActor !== "AI" ||
        state.topicHash !== prepared.topicHash ||
        state.questionHashes.at(-1) !== prepared.previousQuestionHash
      ) {
        throw new QuestionGameRunError("인공지능 질문 생성 임대가 실행 상태와 일치하지 않습니다", 409);
      }
    } else {
      state = parseDiceState(run.state);
      ensureDiceProgress(state, mode, run.version);
      lease = state.aiGenerationLease;
      if (
        mode !== "AI" ||
        state.nextStep !== "AI_QUESTION" ||
        state.pendingRoll?.actor !== "AI" ||
        state.pendingRoll.face !== prepared.diceFace ||
        prepared.topicHash !== hashActivityText("topic", "dice") ||
        prepared.previousQuestionHash !== diceAiContextHash(state.pendingRoll.face)
      ) {
        throw new QuestionGameRunError("인공지능 질문 생성 임대가 실행 상태와 일치하지 않습니다", 409);
      }
    }
    if (
      !lease ||
      lease.id !== prepared.leaseId ||
      lease.generationRequestId !== prepared.generationRequestId ||
      lease.runVersion !== prepared.runVersion
    ) {
      throw new QuestionGameRunError("인공지능 질문 생성 임대가 실행 상태와 일치하지 않습니다", 409);
    }
    await tx.gameRun.update({
      where: { id: run.id },
      data: {
        state: toJson({
          ...state,
          aiGenerationLease: {
            ...lease,
            expiresAt: issued.expiresAt.getTime(),
            issuedResponse,
          },
        }),
      },
    });
  });
  return response;
}

export async function releaseQuestionGameAiTurnLease(
  prepared: PreparedQuestionGameAiTurn,
): Promise<boolean> {
  return serializable(async (tx) => {
    const actor = await loadActor(tx, prepared.ownerId);
    const run = await loadOwnedRun(tx, actor.id, prepared.runId);
    if (run.version !== prepared.runVersion || run.gameId !== prepared.gameId) return false;
    const mode = storedRunMode(run.mode);
    const state = prepared.gameId === "relay"
      ? parseRelayState(run.state)
      : parseDiceState(run.state);
    if (prepared.gameId === "relay") {
      ensureRelayProgress(state as RelayRunState, mode, run.version);
    } else {
      ensureDiceProgress(state as DiceRunState, mode, run.version);
    }
    const lease = state.aiGenerationLease;
    if (
      mode !== "AI" ||
      (prepared.gameId === "relay"
        ? (state as RelayRunState).nextActor !== "AI"
        : (state as DiceRunState).nextStep !== "AI_QUESTION") ||
      !lease ||
      lease.id !== prepared.leaseId ||
      lease.generationRequestId !== prepared.generationRequestId
    ) {
      return false;
    }
    const stateWithoutLease = { ...state };
    delete stateWithoutLease.aiGenerationLease;
    await tx.gameRun.update({
      where: { id: run.id },
      data: { state: toJson(stateWithoutLease) },
    });
    return true;
  });
}

async function rollQuestionDice(
  actorId: string,
  runId: string,
  input: Record<string, unknown>,
  requestId: string,
  expectedVersion: number,
  now: Date,
) {
  const requestFingerprint = fingerprint({ action: input.action });
  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId);
    const run = await loadOwnedRun(tx, actor.id, runId);
    const existing = await tx.gameActivity.findUnique({
      where: { uniq_game_activity_request: { runId, requestId } },
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new QuestionGameRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return { ...replaySnapshot(existing.responseSnapshot), replayed: true };
    }
    ensureActive(run, now);
    if (run.version !== expectedVersion) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.gameId !== "dice") {
      throw new QuestionGameRunError("이 질문놀이는 주사위 굴리기를 지원하지 않습니다", 409, {
        unsupported: true,
      });
    }
    const mode = storedRunMode(run.mode);
    const state = parseDiceState(run.state);
    ensureDiceProgress(state, mode, run.version);
    if (state.nextStep !== "STUDENT_ROLL" && state.nextStep !== "AI_ROLL") {
      throw new QuestionGameRunError("지금은 주사위를 굴릴 차례가 아닙니다", 409);
    }
    const diceActor: DiceActor = state.nextStep === "STUDENT_ROLL" ? "STUDENT" : "AI";
    const face = randomInt(1, 7);
    const nextState: DiceRunState = {
      ...state,
      activitySequence: state.activitySequence + 1,
      nextStep: diceActor === "STUDENT" ? "STUDENT_QUESTION" : "AI_QUESTION",
      pendingRoll: { actor: diceActor, face },
    };
    ensureDiceProgress(nextState, mode, run.version + 1);
    const nextRun = await tx.gameRun.update({
      where: { id: run.id },
      data: { state: toJson(nextState), version: run.version + 1 },
    });
    const response = { run: publicRunWithRole(nextRun as StoredRun, actor.role) };
    await tx.gameActivity.create({
      data: {
        runId: run.id,
        actorId: actor.id,
        requestId,
        requestFingerprint,
        sequence: nextState.activitySequence,
        type: DICE_ROLL_ACTIVITY_TYPE,
        payload: toJson({ actor: diceActor, face }),
        validQuestionCount: 0,
        scoreValue: 0,
        responseSnapshot: toJson(response),
      },
    });
    return { ...response, replayed: false };
  });
}

async function submitQuestionDiceQuestion(
  actorId: string,
  runId: string,
  input: Record<string, unknown>,
  requestId: string,
  expectedVersion: number,
  now: Date,
) {
  const locale = parseLocale(input.locale);
  const { question, questionLength } = validateQuestionText(input.question, locale);
  const questionHash = hashActivityText("question", question);
  const requestFingerprint = fingerprint({ action: input.action, locale, questionHash });

  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId, "update");
    const run = await loadOwnedRun(tx, actor.id, runId);
    const existing = await tx.gameActivity.findUnique({
      where: { uniq_game_activity_request: { runId, requestId } },
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new QuestionGameRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return { ...replaySnapshot(existing.responseSnapshot), replayed: true };
    }
    ensureActive(run, now);
    if (run.version !== expectedVersion) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.gameId !== "dice") {
      throw new QuestionGameRunError("이 질문놀이는 주사위 질문을 지원하지 않습니다", 409, {
        unsupported: true,
      });
    }
    const mode = storedRunMode(run.mode);
    const state = parseDiceState(run.state);
    ensureDiceProgress(state, mode, run.version);
    if (state.locale !== locale) {
      throw new QuestionGameRunError("실행을 만든 언어로 질문해 주세요", 409);
    }
    if (state.nextStep !== "STUDENT_QUESTION" || state.pendingRoll?.actor !== "STUDENT") {
      throw new QuestionGameRunError("학생 주사위를 먼저 굴려 주세요", 409);
    }
    if (state.questionHashes.includes(questionHash)) {
      throw new QuestionGameRunError("같은 질문은 다시 등록할 수 없습니다", 409);
    }
    const face = state.pendingRoll.face;
    const nextQuestionCount = state.questionCount + 1;
    const nextState: DiceRunState = {
      ...state,
      questionCount: nextQuestionCount,
      activitySequence: state.activitySequence + 1,
      nextStep:
        nextQuestionCount === state.targetCount
          ? "COMPLETE"
          : mode === "AI"
            ? "AI_ROLL"
            : "STUDENT_ROLL",
      questionHashes: [...state.questionHashes, questionHash],
    };
    delete nextState.pendingRoll;
    ensureDiceProgress(nextState, mode, run.version + 1);

    if (nextState.nextStep === "COMPLETE") {
      const completedAt = await lockedDatabaseClock(tx);
      ensureActive(run, completedAt);
      const settlement = await settleDiceRun(
        tx,
        actor,
        run,
        nextState,
        mode,
        completedAt,
        { sequence: nextState.activitySequence, face, questionHash },
      );
      const response = {
        run: publicRunWithRole(settlement.run, actor.role),
        result: settlement.result,
      };
      await tx.gameActivity.create({
        data: {
          runId: run.id,
          actorId: actor.id,
          requestId,
          requestFingerprint,
          sequence: nextState.activitySequence,
          type: DICE_QUESTION_ACTIVITY_TYPE,
          payload: toJson({
            actor: "STUDENT",
            face,
            locale,
            questionLength,
            questionHash,
            autoSettled: true,
            scoreDate: settlement.scoreDate,
          }),
          validQuestionCount: 1,
          scoreValue: settlement.result.awarded,
          responseSnapshot: toJson(response),
        },
      });
      return { ...response, replayed: false };
    }

    const nextRun = await tx.gameRun.update({
      where: { id: run.id },
      data: { state: toJson(nextState), version: run.version + 1 },
    });
    const response = { run: publicRunWithRole(nextRun as StoredRun, actor.role) };
    await tx.gameActivity.create({
      data: {
        runId: run.id,
        actorId: actor.id,
        requestId,
        requestFingerprint,
        sequence: nextState.activitySequence,
        type: DICE_QUESTION_ACTIVITY_TYPE,
        payload: toJson({ actor: "STUDENT", face, locale, questionLength, questionHash }),
        validQuestionCount: 1,
        scoreValue: 0,
        responseSnapshot: toJson(response),
      },
    });
    return { ...response, replayed: false };
  });
}

async function recordQuestionDiceAiQuestion(
  actorId: string,
  runId: string,
  input: Record<string, unknown>,
  requestId: string,
  expectedVersion: number,
  now: Date,
) {
  const generationRequestId = requireRequestId(input.generationRequestId);
  const output = typeof input.output === "string" ? input.output.trim() : "";
  const outputLength = [...output].length;
  if (!output || outputLength > QUESTION_GAME_LIMITS.question) {
    throw new QuestionGameRunError("인공지능 질문이 올바르지 않습니다", 400);
  }
  const proof = typeof input.proof === "string" ? input.proof : "";
  if (!proof || proof.length > 4_096) {
    throw new QuestionGameRunError("인공지능 차례 증명이 올바르지 않습니다", 400);
  }
  const outputHash = hashActivityText("ai-output", output);
  const requestFingerprint = fingerprint({
    action: input.action,
    generationRequestId,
    outputHash,
    proofHash: fingerprint(proof),
  });

  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId);
    const run = await loadOwnedRun(tx, actor.id, runId);
    const existing = await tx.gameActivity.findUnique({
      where: { uniq_game_activity_request: { runId, requestId } },
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new QuestionGameRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return { ...replaySnapshot(existing.responseSnapshot), replayed: true };
    }
    ensureActive(run, now);
    if (run.version !== expectedVersion) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.gameId !== "dice") {
      throw new QuestionGameRunError("이 질문놀이는 주사위 질문을 지원하지 않습니다", 409, {
        unsupported: true,
      });
    }
    const mode = storedRunMode(run.mode);
    if (mode !== "AI") {
      throw new QuestionGameRunError("인공지능 도움 모드에서만 이용할 수 있습니다", 409);
    }
    const state = parseDiceState(run.state);
    ensureDiceProgress(state, mode, run.version);
    if (state.nextStep !== "AI_QUESTION" || state.pendingRoll?.actor !== "AI") {
      throw new QuestionGameRunError("지금은 인공지능 질문 차례가 아닙니다", 409);
    }
    validateQuestionText(output, state.locale);

    let proofPayload;
    try {
      proofPayload = verifyQuestionGameAiProof(proof, activityHashSecret(), now);
    } catch (error) {
      if (error instanceof QuestionGameAiProofError) {
        throw new QuestionGameRunError(
          "인공지능 차례 증명이 만료되었거나 올바르지 않습니다",
          409,
          { aiProofRejected: true },
        );
      }
      throw error;
    }
    const lease = state.aiGenerationLease;
    const face = state.pendingRoll.face;
    if (
      !lease ||
      lease.expiresAt <= now.getTime() ||
      lease.generationRequestId !== generationRequestId ||
      proofPayload.runId !== run.id ||
      proofPayload.ownerId !== actor.id ||
      proofPayload.runVersion !== run.version ||
      proofPayload.leaseId !== lease.id ||
      proofPayload.generationRequestId !== generationRequestId ||
      proofPayload.topicHash !== hashActivityText("topic", "dice") ||
      proofPayload.previousQuestionHash !== diceAiContextHash(face) ||
      proofPayload.outputHash !== outputHash
    ) {
      throw new QuestionGameRunError("인공지능 차례 증명이 실행 상태와 일치하지 않습니다", 409);
    }

    const nextState: DiceRunState = {
      ...state,
      aiTurnCount: state.aiTurnCount + 1,
      activitySequence: state.activitySequence + 1,
      nextStep: "STUDENT_ROLL",
    };
    delete nextState.pendingRoll;
    delete nextState.aiGenerationLease;
    ensureDiceProgress(nextState, mode, run.version + 1);
    const nextRun = await tx.gameRun.update({
      where: { id: run.id },
      data: { state: toJson(nextState), version: run.version + 1 },
    });
    const response = { run: publicRunWithRole(nextRun as StoredRun, actor.role) };
    await tx.gameActivity.create({
      data: {
        runId: run.id,
        actorId: actor.id,
        requestId,
        requestFingerprint,
        sequence: nextState.activitySequence,
        type: DICE_AI_QUESTION_ACTIVITY_TYPE,
        payload: toJson({
          actor: "AI",
          face,
          locale: state.locale,
          outputLength,
          outputHash,
          proofId: proofPayload.proofId,
          generationRequestId: proofPayload.generationRequestId,
        }),
        validQuestionCount: 0,
        scoreValue: 0,
        responseSnapshot: toJson(response),
      },
    });
    return { ...response, replayed: false };
  });
}

async function recordRelayAiTurn(
  actorId: string,
  runId: string,
  input: Record<string, unknown>,
  requestId: string,
  expectedVersion: number,
  now: Date,
) {
  const generationRequestId = requireRequestId(input.generationRequestId);
  const output = typeof input.output === "string" ? input.output.trim() : "";
  const outputLength = [...output].length;
  if (!output || outputLength > QUESTION_GAME_LIMITS.question) {
    throw new QuestionGameRunError("인공지능 질문이 올바르지 않습니다", 400);
  }
  const proof = typeof input.proof === "string" ? input.proof : "";
  if (!proof || proof.length > 4_096) {
    throw new QuestionGameRunError("인공지능 차례 증명이 올바르지 않습니다", 400);
  }
  const outputHash = hashActivityText("ai-output", output);
  const requestFingerprint = fingerprint({
    action: input.action,
    generationRequestId,
    outputHash,
    proofHash: fingerprint(proof),
  });

  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId);
    const run = await loadOwnedRun(tx, actor.id, runId);
    const existing = await tx.gameActivity.findUnique({
      where: { uniq_game_activity_request: { runId, requestId } },
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new QuestionGameRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return { ...replaySnapshot(existing.responseSnapshot), replayed: true };
    }
    ensureActive(run, now);
    if (run.version !== expectedVersion) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.gameId !== "relay") {
      throw new QuestionGameRunError("이 질문놀이는 서버 동작을 아직 지원하지 않습니다", 409, {
        unsupported: true,
      });
    }
    const mode = storedRunMode(run.mode);
    if (mode !== "AI") {
      throw new QuestionGameRunError("인공지능 도움 모드에서만 이용할 수 있습니다", 409);
    }
    const state = parseRelayState(run.state);
    ensureRelayProgress(state, mode, run.version);
    if (state.nextActor !== "AI") {
      throw new QuestionGameRunError("지금은 인공지능 질문 차례가 아닙니다", 409);
    }
    validateQuestionText(output, state.locale);

    let proofPayload;
    try {
      proofPayload = verifyQuestionGameAiProof(proof, activityHashSecret(), now);
    } catch (error) {
      if (error instanceof QuestionGameAiProofError) {
        throw new QuestionGameRunError(
          "인공지능 차례 증명이 만료되었거나 올바르지 않습니다",
          409,
          { aiProofRejected: true },
        );
      }
      throw error;
    }
    const lease = state.aiGenerationLease;
    if (
      !lease ||
      lease.expiresAt <= now.getTime() ||
      lease.generationRequestId !== generationRequestId ||
      proofPayload.runId !== run.id ||
      proofPayload.ownerId !== actor.id ||
      proofPayload.runVersion !== run.version ||
      proofPayload.leaseId !== lease.id ||
      proofPayload.generationRequestId !== generationRequestId ||
      proofPayload.topicHash !== state.topicHash ||
      proofPayload.previousQuestionHash !== state.questionHashes.at(-1) ||
      proofPayload.outputHash !== outputHash
    ) {
      throw new QuestionGameRunError("인공지능 차례 증명이 실행 상태와 일치하지 않습니다", 409);
    }

    const stateWithoutLease = { ...state };
    delete stateWithoutLease.aiGenerationLease;
    const nextState: RelayRunState = {
      ...stateWithoutLease,
      aiTurnCount: state.aiTurnCount + 1,
      activitySequence: state.activitySequence + 1,
      nextActor: "STUDENT",
    };
    ensureRelayProgress(nextState, mode, run.version + 1);
    const nextRun = await tx.gameRun.update({
      where: { id: run.id },
      data: { state: toJson(nextState), version: run.version + 1 },
    });
    const response = { run: publicRunWithRole(nextRun as StoredRun, actor.role) };
    await tx.gameActivity.create({
      data: {
        runId: run.id,
        actorId: actor.id,
        requestId,
        requestFingerprint,
        sequence: nextState.activitySequence,
        type: RELAY_AI_ACTIVITY_TYPE,
        payload: toJson({
          locale: state.locale,
          outputLength,
          outputHash,
          proofId: proofPayload.proofId,
          generationRequestId: proofPayload.generationRequestId,
        }),
        validQuestionCount: 0,
        scoreValue: 0,
        responseSnapshot: toJson(response),
      },
    });
    return { ...response, replayed: false };
  });
}

async function submitQuestionLadderQuestion(
  actorId: string,
  runId: string,
  input: Record<string, unknown>,
  requestId: string,
  expectedVersion: number,
  now: Date,
) {
  const locale = parseLocale(input.locale);
  const { question, questionLength } = validateQuestionText(input.question, locale);
  const questionHash = hashActivityText("question", question);
  const startColumn = input.startColumn;
  if (
    typeof startColumn !== "number" ||
    !Number.isSafeInteger(startColumn) ||
    startColumn < 0
  ) {
    throw new QuestionGameRunError("질문 사다리 시작점이 올바르지 않습니다", 400);
  }
  const requestFingerprint = fingerprint({
    action: input.action,
    locale,
    questionHash,
    startColumn,
  });

  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId, "update");
    const run = await loadOwnedRun(tx, actor.id, runId);
    const existing = await tx.gameActivity.findUnique({
      where: { uniq_game_activity_request: { runId, requestId } },
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new QuestionGameRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return { ...replaySnapshot(existing.responseSnapshot), replayed: true };
    }
    ensureActive(run, now);
    if (run.version !== expectedVersion) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.gameId !== "ladder") {
      throw new QuestionGameRunError("이 질문놀이는 사다리 질문을 지원하지 않습니다", 409, {
        unsupported: true,
      });
    }
    const mode = storedRunMode(run.mode);
    const state = parseLadderState(run.state);
    ensureLadderProgress(state, mode, run.version);
    if (state.locale !== locale) {
      throw new QuestionGameRunError("실행을 만든 언어로 질문해 주세요", 409);
    }
    if (state.nextStep !== "QUESTION" || state.questionCount >= state.targetCount) {
      throw new QuestionGameRunError("목표 질문 수를 모두 채웠습니다", 409);
    }
    if (state.questionHashes.includes(questionHash)) {
      throw new QuestionGameRunError("같은 질문은 다시 등록할 수 없습니다", 409);
    }
    const roundIndex = state.questionCount;
    const grid = state.grids[roundIndex];
    if (!grid) {
      throw new QuestionGameRunError("질문 사다리 실행 상태가 손상되었습니다", 409);
    }
    const destinationColumn = ladderDestination(startColumn, grid);
    const topicHash = state.topicHashes[destinationColumn];
    if (!topicHash) {
      throw new QuestionGameRunError("질문 사다리 실행 상태가 손상되었습니다", 409);
    }
    const nextQuestionCount = state.questionCount + 1;
    const nextState: LadderRunState = {
      ...state,
      questionCount: nextQuestionCount,
      activitySequence: state.activitySequence + 1,
      nextStep: nextQuestionCount === state.targetCount ? "COMPLETE" : "QUESTION",
      questionHashes: [...state.questionHashes, questionHash],
    };
    ensureLadderProgress(nextState, mode, run.version + 1);
    const evidence: PendingLadderQuestionEvidence = {
      sequence: nextState.activitySequence,
      round: roundIndex + 1,
      startColumn,
      destinationColumn,
      topicHash,
      locale,
      questionHash,
    };

    if (nextState.nextStep === "COMPLETE") {
      const completedAt = await lockedDatabaseClock(tx);
      ensureActive(run, completedAt);
      const settlement = await settleLadderRun(
        tx,
        actor,
        run,
        nextState,
        mode,
        completedAt,
        evidence,
      );
      const response = {
        run: publicRunWithRole(settlement.run, actor.role),
        result: settlement.result,
      };
      await tx.gameActivity.create({
        data: {
          runId: run.id,
          actorId: actor.id,
          requestId,
          requestFingerprint,
          sequence: nextState.activitySequence,
          type: LADDER_QUESTION_ACTIVITY_TYPE,
          payload: toJson({
            ...evidence,
            questionLength,
            autoSettled: true,
            scoreDate: settlement.scoreDate,
          }),
          validQuestionCount: 1,
          scoreValue: settlement.result.awarded,
          responseSnapshot: toJson(response),
        },
      });
      return { ...response, replayed: false };
    }

    const nextRun = await tx.gameRun.update({
      where: { id: run.id },
      data: { state: toJson(nextState), version: run.version + 1 },
    });
    const response = { run: publicRunWithRole(nextRun as StoredRun, actor.role) };
    await tx.gameActivity.create({
      data: {
        runId: run.id,
        actorId: actor.id,
        requestId,
        requestFingerprint,
        sequence: nextState.activitySequence,
        type: LADDER_QUESTION_ACTIVITY_TYPE,
        payload: toJson({ ...evidence, questionLength }),
        validQuestionCount: 1,
        scoreValue: 0,
        responseSnapshot: toJson(response),
      },
    });
    return { ...response, replayed: false };
  });
}

export async function applyQuestionGameRunAction(
  actorId: string,
  runId: string,
  input: unknown,
  now = new Date(),
) {
  if (!isRecord(input)) throw new QuestionGameRunError("요청 본문이 올바르지 않습니다", 400);
  const requestId = requireRequestId(input.requestId);
  const expectedVersion = requireVersion(input.expectedVersion);
  if (input.action === "ladder-submit-question") {
    return submitQuestionLadderQuestion(
      actorId,
      runId,
      input,
      requestId,
      expectedVersion,
      now,
    );
  }
  if (input.action === "dice-roll") {
    return rollQuestionDice(actorId, runId, input, requestId, expectedVersion, now);
  }
  if (input.action === "dice-submit-question") {
    return submitQuestionDiceQuestion(
      actorId,
      runId,
      input,
      requestId,
      expectedVersion,
      now,
    );
  }
  if (input.action === "dice-record-ai-question") {
    return recordQuestionDiceAiQuestion(
      actorId,
      runId,
      input,
      requestId,
      expectedVersion,
      now,
    );
  }
  if (input.action === "relay-record-ai-turn") {
    return recordRelayAiTurn(actorId, runId, input, requestId, expectedVersion, now);
  }
  if (input.action !== "relay-submit-question") {
    throw new QuestionGameRunError("지원하지 않는 질문놀이 동작입니다", 400);
  }
  const locale = parseLocale(input.locale);
  const { question, questionLength } = validateQuestionText(input.question, locale);
  const normalizedHash = hashActivityText("question", question);
  const requestFingerprint = fingerprint({ action: input.action, locale, normalizedHash });

  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId, "update");
    const run = await loadOwnedRun(tx, actor.id, runId);
    const existing = await tx.gameActivity.findUnique({
      where: { uniq_game_activity_request: { runId, requestId } },
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new QuestionGameRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return { ...replaySnapshot(existing.responseSnapshot), replayed: true };
    }
    ensureActive(run, now);
    if (run.version !== expectedVersion) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.gameId !== "relay") {
      throw new QuestionGameRunError("이 질문놀이는 서버 동작을 아직 지원하지 않습니다", 409, {
        unsupported: true,
      });
    }
    const state = parseRelayState(run.state);
    const mode = storedRunMode(run.mode);
    ensureRelayProgress(state, mode, run.version);
    if (state.locale !== locale) {
      throw new QuestionGameRunError("실행을 만든 언어로 질문해 주세요", 409);
    }
    if (state.nextActor !== "STUDENT") {
      throw new QuestionGameRunError("인공지능 질문 차례를 먼저 마쳐 주세요", 409);
    }
    if (state.questionCount >= state.targetCount) {
      throw new QuestionGameRunError("목표 질문 수를 모두 채웠습니다", 409);
    }
    if (state.questionHashes.includes(normalizedHash)) {
      throw new QuestionGameRunError("같은 질문은 다시 등록할 수 없습니다", 409);
    }

    const nextState: RelayRunState = {
      ...state,
      questionCount: state.questionCount + 1,
      activitySequence: state.activitySequence + 1,
      nextActor:
        state.questionCount + 1 === state.targetCount
          ? "COMPLETE"
          : mode === "AI"
            ? "AI"
            : "STUDENT",
      questionHashes: [...state.questionHashes, normalizedHash],
    };
    ensureRelayProgress(nextState, mode, run.version + 1);
    if (nextState.nextActor === "COMPLETE") {
      const completedAt = await lockedDatabaseClock(tx);
      ensureActive(run, completedAt);
      const settlement = await settleRelayRun(
        tx,
        actor,
        run,
        nextState,
        mode,
        completedAt,
        1,
      );
      const response = {
        run: publicRunWithRole(settlement.run, actor.role),
        result: settlement.result,
      };
      await tx.gameActivity.create({
        data: {
          runId: run.id,
          actorId: actor.id,
          requestId,
          requestFingerprint,
          sequence: nextState.activitySequence,
          type: RELAY_ACTIVITY_TYPE,
          payload: toJson({
            locale,
            questionLength,
            questionHash: normalizedHash,
            autoSettled: true,
            scoreDate: settlement.scoreDate,
          }),
          validQuestionCount: 1,
          scoreValue: settlement.result.awarded,
          responseSnapshot: toJson(response),
        },
      });
      return { ...response, replayed: false };
    }
    const nextRun = await tx.gameRun.update({
      where: { id: run.id },
      data: { state: toJson(nextState), version: run.version + 1 },
    });
    const response = { run: publicRunWithRole(nextRun as StoredRun, actor.role) };
    await tx.gameActivity.create({
      data: {
        runId: run.id,
        actorId: actor.id,
        requestId,
        requestFingerprint,
        sequence: nextState.activitySequence,
        type: RELAY_ACTIVITY_TYPE,
        payload: toJson({
          locale,
          questionLength,
          questionHash: normalizedHash,
        }),
        validQuestionCount: 1,
        scoreValue: 0,
        responseSnapshot: toJson(response),
      },
    });
    return { ...response, replayed: false };
  });
}

export async function completeQuestionGameRun(
  actorId: string,
  runId: string,
  input: unknown,
) {
  if (!isRecord(input)) throw new QuestionGameRunError("요청 본문이 올바르지 않습니다", 400);
  const requestId = requireRequestId(input.requestId);
  const expectedVersion = requireVersion(input.expectedVersion);
  const requestFingerprint = fingerprint({ action: COMPLETE_ACTIVITY_TYPE });

  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId, "update");
    const run = await loadOwnedRun(tx, actor.id, runId);
    const existing = await tx.gameActivity.findUnique({
      where: { uniq_game_activity_request: { runId, requestId } },
    });
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new QuestionGameRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return { ...replaySnapshot(existing.responseSnapshot), replayed: true };
    }
    if (run.gameId !== "relay" && run.gameId !== "dice" && run.gameId !== "ladder") {
      throw new QuestionGameRunError("이 질문놀이는 서버 완료를 아직 지원하지 않습니다", 409, {
        unsupported: true,
      });
    }

    const mode = storedRunMode(run.mode);
    const state = run.gameId === "relay"
      ? parseRelayState(run.state)
      : run.gameId === "dice"
        ? parseDiceState(run.state)
        : parseLadderState(run.state);
    if (run.gameId === "relay") {
      ensureRelayProgress(state as RelayRunState, mode, run.version, run.status === "ACTIVE");
    } else if (run.gameId === "dice") {
      ensureDiceProgress(state as DiceRunState, mode, run.version, run.status === "ACTIVE");
    } else {
      ensureLadderProgress(
        state as LadderRunState,
        mode,
        run.version,
        run.status === "ACTIVE",
      );
    }
    if (run.status === "SETTLED") {
      if (!state.result) {
        throw new QuestionGameRunError("질문놀이 정산 결과가 손상되었습니다", 409);
      }
      return {
        run: publicRunWithRole(run, actor.role),
        result: { ...state.result, alreadySettled: true },
        replayed: true,
      };
    }

    const completedAt = await lockedDatabaseClock(tx);
    ensureActive(run, completedAt);
    if (run.version !== expectedVersion) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    const settlement = run.gameId === "relay"
      ? await settleRelayRun(
          tx,
          actor,
          run,
          state as RelayRunState,
          mode,
          completedAt,
        )
      : run.gameId === "dice"
        ? await settleDiceRun(
            tx,
            actor,
            run,
            state as DiceRunState,
            mode,
            completedAt,
          )
        : await settleLadderRun(
            tx,
            actor,
            run,
            state as LadderRunState,
            mode,
            completedAt,
          );
    const response = {
      run: publicRunWithRole(settlement.run, actor.role),
      result: settlement.result,
    };
    await tx.gameActivity.create({
      data: {
        runId: run.id,
        actorId: actor.id,
        requestId,
        requestFingerprint,
        sequence: state.activitySequence + 1,
        type: COMPLETE_ACTIVITY_TYPE,
        payload: toJson({
          verifiedQuestionCount: settlement.verifiedQuestionCount,
          verifiedAiTurnCount: settlement.verifiedAiTurnCount,
          scoreDate: settlement.scoreDate,
        }),
        validQuestionCount: 0,
        scoreValue: settlement.result.awarded,
        responseSnapshot: toJson(response),
      },
    });
    return { ...response, replayed: false };
  });
}

export async function getQuestionGameRunResult(
  actorId: string,
  runId: string,
  now = new Date(),
) {
  return serializable(async (tx) => {
    const actor = await loadActor(tx, actorId);
    const ownedRun = await loadOwnedRun(tx, actor.id, runId);
    const run = await expireRunForRead(tx, ownedRun, now);
    const definition = findQuestionGameRunDefinition(run.gameId);
    if (!definition) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
    }
    const state = definition.parseState(run.state);
    const result = definition.result(state);
    return {
      run: publicRunWithRole(run, actor.role),
      result: result ? { ...result, alreadySettled: run.status === "SETTLED" } : null,
    };
  });
}
