import { createHash } from "node:crypto";
import {
  getKabaSentences,
  isQuestionFormForLocale,
} from "../../src/lib/question-game-i18n";
import {
  QUESTION_GAME_LIMITS,
  QUESTION_GAME_RULES,
} from "../../src/lib/question-game-rules";
import {
  AI_POINTS,
  DAILY_LIMITS,
  SOLO_POINTS,
} from "../../src/lib/points-policy";

const RUN_COLLECTION_PATH = /^\/api\/question-games\/runs\/?$/;
const RUN_OPERATION_PATH =
  /^\/api\/question-games\/runs\/([^/]+)\/(actions|ai-turn|complete|result)\/?$/;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RunMode = "SOLO" | "AI";
type RunLocale = "ko" | "en";
type RunStatus = "ACTIVE" | "SETTLED";
type RunGameId = "relay" | "dice" | "ladder" | "kaba";
type DiceActor = "STUDENT" | "AI";
type DiceNextStep =
  | "STUDENT_ROLL"
  | "STUDENT_QUESTION"
  | "AI_ROLL"
  | "AI_QUESTION"
  | "COMPLETE";
type KabaNextStep = "STUDENT_ATTEMPT" | "COMPLETE";

interface DicePendingRoll {
  actor: DiceActor;
  face: number;
}

export interface BrowserQuestionGameRunActor {
  id: string;
  role: "STUDENT" | "TEACHER";
}

export interface BrowserQuestionGameRunRequest {
  method: string;
  pathname: string;
  body: Record<string, unknown>;
}

export interface BrowserQuestionGameRunResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface BrowserQuestionGameRunStore {
  dispatch: (
    actor: BrowserQuestionGameRunActor,
    request: BrowserQuestionGameRunRequest,
  ) => BrowserQuestionGameRunResponse;
  clear: () => void;
}

interface RunResult {
  awarded: number;
  dailyLimit: number;
  dailyRemaining: number;
  cappedByLimit: boolean;
  preview: boolean;
}

interface ReplayEntry {
  fingerprint: string;
  response: Record<string, unknown>;
}

interface IssuedAiTurn {
  generationRequestId: string;
  output: string;
  proof: string;
  proofId: string;
  expiresAt: string;
  runVersion: number;
  diceFace?: number;
}

interface StoredRun {
  id: string;
  ownerId: string;
  preview: boolean;
  gameId: RunGameId;
  mode: RunMode;
  locale: RunLocale;
  topic: string;
  status: RunStatus;
  version: number;
  targetCount: number;
  questionCount: number;
  aiTurnCount: number;
  questions: string[];
  topicHashes: string[];
  questionHashes: string[];
  ladderGrids: boolean[][][];
  kabaSentencePlan: string[];
  correctCount: number;
  expiresAt: string;
  completedAt: string | null;
  result: RunResult | null;
  actions: Map<string, ReplayEntry>;
  aiIssues: Map<string, ReplayEntry>;
  currentAiTurn: IssuedAiTurn | null;
  nextStep?: DiceNextStep;
  pendingRoll?: DicePendingRoll;
  kabaNextStep?: KabaNextStep;
}

interface CreationReplay {
  fingerprint: string;
  runId: string;
}

class BrowserRunError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BrowserRunError";
  }
}

function cloneBody(value: Record<string, unknown>) {
  return structuredClone(value);
}

function success(status: number, body: Record<string, unknown>) {
  return { status, body: cloneBody(body) };
}

function requireRequestId(value: unknown) {
  if (typeof value !== "string" || !REQUEST_ID_PATTERN.test(value)) {
    throw new BrowserRunError("요청 식별값이 올바르지 않습니다", 400);
  }
  return value;
}

function requireVersion(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new BrowserRunError("실행 버전이 올바르지 않습니다", 400);
  }
  return value;
}

function parseMode(value: unknown): RunMode {
  if (value === "solo" || value === "SOLO") return "SOLO";
  if (value === "ai" || value === "AI") return "AI";
  throw new BrowserRunError("놀이 모드가 올바르지 않습니다", 400);
}

function parseLocale(value: unknown): RunLocale {
  if (value === "ko" || value === "en") return value;
  throw new BrowserRunError("질문 언어값이 올바르지 않습니다", 400);
}

function requireTopic(value: unknown) {
  const topic = typeof value === "string" ? value.trim() : "";
  if (!topic || [...topic].length > QUESTION_GAME_LIMITS.topic) {
    throw new BrowserRunError("주제가 올바르지 않습니다", 400);
  }
  return topic;
}

function requireQuestion(value: unknown, locale: RunLocale) {
  const question = typeof value === "string" ? value.trim() : "";
  if (
    !question ||
    [...question].length > QUESTION_GAME_LIMITS.question ||
    !isQuestionFormForLocale(question, locale)
  ) {
    throw new BrowserRunError("질문 형태로 입력해 주세요", 400);
  }
  return question;
}

function requireKabaAttempt(value: unknown) {
  const question = typeof value === "string" ? value.trim() : "";
  if (!question || [...question].length > QUESTION_GAME_LIMITS.question) {
    throw new BrowserRunError("바꾼 문장을 입력해 주세요", 400);
  }
  return question;
}

function fingerprint(value: unknown) {
  return JSON.stringify(value);
}

function hashPrivateText(kind: "topic" | "question", value: string) {
  return createHash("sha256")
    .update(`browser-question-game:${kind}\0${value}`, "utf8")
    .digest("hex");
}

function requireLadderTopics(value: unknown, mode: RunMode) {
  const expectedCount = mode === "SOLO" ? 4 : 2;
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw new BrowserRunError(
      `질문 사다리 주제를 ${expectedCount}개 입력해 주세요`,
      400,
    );
  }
  return Array.from({ length: expectedCount }, (_, index) =>
    hashPrivateText("topic", requireTopic(value[index]))
  );
}

function createServerLadderGrid(columnCount: number, roundIndex: number) {
  const rungCount = columnCount - 1;
  return Array.from({ length: 10 }, (_, rowIndex) => {
    const phase = rowIndex + roundIndex;
    const selectedRung = phase % rungCount;
    const hasRung = phase % 4 !== 0;
    return Array.from(
      { length: rungCount },
      (_, rungIndex) => hasRung && rungIndex === selectedRung,
    );
  });
}

function publicRun(run: StoredRun) {
  const awaitingAiTurn = run.gameId === "relay"
    ? run.status === "ACTIVE" &&
      run.mode === "AI" &&
      run.questionCount === run.aiTurnCount + 1 &&
      run.questionCount < run.targetCount
    : run.gameId === "dice"
      ? run.status === "ACTIVE" && run.mode === "AI" && run.nextStep === "AI_QUESTION"
      : false;
  return {
    id: run.id,
    gameId: run.gameId,
    mode: run.mode,
    status: run.status,
    version: run.version,
    questionCount: run.questionCount,
    aiTurnCount: run.aiTurnCount,
    awaitingAiTurn,
    targetCount: run.targetCount,
    preview: run.preview,
    expiresAt: run.expiresAt,
    completedAt: run.completedAt,
    ...(run.gameId === "dice"
      ? {
          nextStep: run.nextStep,
          pendingRoll: run.pendingRoll ?? null,
        }
      : {}),
    ...(run.gameId === "ladder"
      ? {
          ladderRound: run.status === "ACTIVE" ? run.questionCount + 1 : null,
          ladderGrid:
            run.status === "ACTIVE"
              ? run.ladderGrids[run.questionCount] ?? null
              : null,
        }
      : {}),
    ...(run.gameId === "kaba"
      ? {
          correctCount: run.correctCount,
          currentSentence:
            run.status === "ACTIVE"
              ? run.kabaSentencePlan[run.questionCount] ?? null
              : null,
          kabaNextStep: run.kabaNextStep,
        }
      : {}),
  };
}

function replayResponse(entry: ReplayEntry) {
  return success(200, { ...cloneBody(entry.response), replayed: true });
}

export function createBrowserQuestionGameRunStore(): BrowserQuestionGameRunStore {
  const runs = new Map<string, StoredRun>();
  const creations = new Map<string, CreationReplay>();
  const dailyEarned = new Map<string, number>();
  let nextUuid = 1;
  let nextDiceFace = 1;
  let clock = Date.parse("2030-03-17T00:00:00.000Z");

  const randomUuid = () => {
    const suffix = nextUuid.toString(16).padStart(12, "0");
    nextUuid += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  };
  const nowIso = () => {
    clock += 1_000;
    return new Date(clock).toISOString();
  };

  const ownedRun = (actor: BrowserQuestionGameRunActor, runId: string) => {
    const run = runs.get(runId);
    if (!run) throw new BrowserRunError("질문놀이 실행을 찾을 수 없습니다", 404);
    if (run.ownerId !== actor.id) {
      throw new BrowserRunError("자신의 질문놀이 실행만 이용할 수 있습니다", 403);
    }
    return run;
  };

  const settle = (run: StoredRun) => {
    const policy = run.mode === "SOLO" ? SOLO_POINTS : AI_POINTS;
    const dailyLimit = run.mode === "SOLO" ? DAILY_LIMITS.SOLO : DAILY_LIMITS.AI;
    const dailyKey = `${run.ownerId}:${run.mode}`;
    const earned = dailyEarned.get(dailyKey) ?? 0;
    const validQuestionCount = run.gameId === "kaba"
      ? run.correctCount
      : run.questionCount;
    const requested = validQuestionCount * policy.PER_VALID_QUESTION + policy.COMPLETION;
    const awarded = run.preview ? 0 : Math.max(0, Math.min(requested, dailyLimit - earned));
    if (!run.preview) dailyEarned.set(dailyKey, earned + awarded);
    run.status = "SETTLED";
    run.completedAt = nowIso();
    run.result = {
      awarded,
      dailyLimit,
      dailyRemaining: Math.max(0, dailyLimit - earned - awarded),
      cappedByLimit: !run.preview && awarded < requested,
      preview: run.preview,
    };
    run.currentAiTurn = null;
    if (run.gameId === "dice") {
      run.nextStep = "COMPLETE";
      delete run.pendingRoll;
    }
    if (run.gameId === "kaba") run.kabaNextStep = "COMPLETE";
  };

  const createRun = (
    actor: BrowserQuestionGameRunActor,
    body: Record<string, unknown>,
  ) => {
    const requestId = requireRequestId(body.requestId);
    const gameId = typeof body.gameId === "string" ? body.gameId : "";
    if (
      gameId !== "relay" &&
      gameId !== "dice" &&
      gameId !== "ladder" &&
      gameId !== "kaba"
    ) {
      throw new BrowserRunError("이 질문놀이는 서버 점수 기록을 아직 지원하지 않습니다", 409);
    }
    const mode = parseMode(body.mode);
    const locale = parseLocale(body.locale);
    const topic = gameId === "relay" ? requireTopic(body.topic) : "";
    const topicHashes = gameId === "ladder"
      ? requireLadderTopics(body.topics, mode)
      : [];
    const creationFingerprint = fingerprint({
      gameId,
      mode,
      locale,
      ...(gameId === "ladder" ? { topicHashes } : { topic }),
    });
    const creationKey = `${actor.id}:${requestId}`;
    const existing = creations.get(creationKey);
    if (existing) {
      if (existing.fingerprint !== creationFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 실행 정보가 들어왔습니다", 409);
      }
      const run = runs.get(existing.runId);
      if (!run) throw new BrowserRunError("질문놀이 실행을 찾을 수 없습니다", 404);
      return success(200, { run: publicRun(run), replayed: true });
    }

    const run: StoredRun = {
      id: randomUuid(),
      ownerId: actor.id,
      preview: actor.role === "TEACHER",
      gameId,
      mode,
      locale,
      topic,
      status: "ACTIVE",
      version: 1,
      targetCount: QUESTION_GAME_RULES[gameId].targets[mode === "SOLO" ? "solo" : "ai"].count,
      questionCount: 0,
      aiTurnCount: 0,
      questions: [],
      topicHashes,
      questionHashes: [],
      ladderGrids: gameId === "ladder"
        ? Array.from(
            { length: 3 },
            (_, roundIndex) => createServerLadderGrid(topicHashes.length, roundIndex),
          )
        : [],
      kabaSentencePlan: gameId === "kaba"
        ? [...getKabaSentences(locale)].slice(
            0,
            QUESTION_GAME_RULES.kaba.targets[mode === "SOLO" ? "solo" : "ai"].count,
          )
        : [],
      correctCount: 0,
      expiresAt: "2099-12-31T23:59:59.000Z",
      completedAt: null,
      result: null,
      actions: new Map(),
      aiIssues: new Map(),
      currentAiTurn: null,
      ...(gameId === "dice" ? { nextStep: "STUDENT_ROLL" as const } : {}),
      ...(gameId === "kaba" ? { kabaNextStep: "STUDENT_ATTEMPT" as const } : {}),
    };
    runs.set(run.id, run);
    creations.set(creationKey, { fingerprint: creationFingerprint, runId: run.id });
    return success(201, { run: publicRun(run), replayed: false });
  };

  const submitQuestion = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const locale = parseLocale(body.locale);
    const question = requireQuestion(body.question, locale);
    const actionFingerprint = fingerprint({
      action: "relay-submit-question",
      locale,
      question,
    });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "relay") {
      throw new BrowserRunError("이미 끝난 질문놀이 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (locale !== run.locale) {
      throw new BrowserRunError("실행을 만든 언어로 질문해 주세요", 409);
    }
    if (run.mode === "AI" && run.questionCount !== run.aiTurnCount) {
      throw new BrowserRunError("인공지능 질문 차례를 먼저 마쳐 주세요", 409);
    }
    if (run.questions.includes(question)) {
      throw new BrowserRunError("같은 질문은 다시 등록할 수 없습니다", 409);
    }

    run.questionCount += 1;
    run.version += 1;
    run.questions.push(question);
    if (run.questionCount === run.targetCount) settle(run);
    const response = {
      run: publicRun(run),
      ...(run.result ? { result: run.result } : {}),
    };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const recordAiTurn = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const generationRequestId = requireRequestId(body.generationRequestId);
    const output = typeof body.output === "string" ? body.output.trim() : "";
    const proof = typeof body.proof === "string" ? body.proof : "";
    const actionFingerprint = fingerprint({
      action: "relay-record-ai-turn",
      generationRequestId,
      output,
      proof,
    });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "relay" || run.mode !== "AI") {
      throw new BrowserRunError("인공지능 질문을 기록할 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    const issued = run.currentAiTurn;
    if (
      !issued ||
      issued.generationRequestId !== generationRequestId ||
      issued.output !== output ||
      issued.proof !== proof
    ) {
      throw new BrowserRunError("인공지능 차례 증명이 실행 상태와 일치하지 않습니다", 409);
    }
    run.aiTurnCount += 1;
    run.version += 1;
    run.currentAiTurn = null;
    const response = { run: publicRun(run) };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const rollDice = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const actionFingerprint = fingerprint({ action: "dice-roll" });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "dice") {
      throw new BrowserRunError("주사위를 굴릴 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.nextStep !== "STUDENT_ROLL" && run.nextStep !== "AI_ROLL") {
      throw new BrowserRunError("지금은 주사위를 굴릴 차례가 아닙니다", 409);
    }

    const actor: DiceActor = run.nextStep === "AI_ROLL" ? "AI" : "STUDENT";
    const face = nextDiceFace;
    nextDiceFace = nextDiceFace === 6 ? 1 : nextDiceFace + 1;
    run.pendingRoll = { actor, face };
    run.nextStep = actor === "AI" ? "AI_QUESTION" : "STUDENT_QUESTION";
    run.version += 1;
    const response = { run: publicRun(run) };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const submitDiceQuestion = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const locale = parseLocale(body.locale);
    const question = requireQuestion(body.question, locale);
    const actionFingerprint = fingerprint({
      action: "dice-submit-question",
      locale,
      question,
    });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "dice") {
      throw new BrowserRunError("질문을 등록할 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (locale !== run.locale) {
      throw new BrowserRunError("실행을 만든 언어로 질문해 주세요", 409);
    }
    if (run.nextStep !== "STUDENT_QUESTION" || run.pendingRoll?.actor !== "STUDENT") {
      throw new BrowserRunError("학생 주사위를 먼저 굴려 주세요", 409);
    }
    if (run.questions.includes(question)) {
      throw new BrowserRunError("같은 질문은 다시 등록할 수 없습니다", 409);
    }

    run.questionCount += 1;
    run.version += 1;
    run.questions.push(question);
    delete run.pendingRoll;
    if (run.questionCount === run.targetCount) {
      run.nextStep = "COMPLETE";
      settle(run);
    } else {
      run.nextStep = run.mode === "AI" ? "AI_ROLL" : "STUDENT_ROLL";
    }
    const response = {
      run: publicRun(run),
      ...(run.result ? { result: run.result } : {}),
    };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const recordDiceAiQuestion = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const generationRequestId = requireRequestId(body.generationRequestId);
    const output = requireQuestion(body.output, run.locale);
    const proof = typeof body.proof === "string" ? body.proof : "";
    const actionFingerprint = fingerprint({
      action: "dice-record-ai-question",
      generationRequestId,
      output,
      proof,
    });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "dice" || run.mode !== "AI") {
      throw new BrowserRunError("인공지능 질문을 기록할 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.nextStep !== "AI_QUESTION" || run.pendingRoll?.actor !== "AI") {
      throw new BrowserRunError("지금은 인공지능 질문 차례가 아닙니다", 409);
    }
    const issued = run.currentAiTurn;
    if (
      !issued ||
      issued.generationRequestId !== generationRequestId ||
      issued.output !== output ||
      issued.proof !== proof ||
      issued.diceFace !== run.pendingRoll.face
    ) {
      throw new BrowserRunError("인공지능 차례 증명이 실행 상태와 일치하지 않습니다", 409);
    }

    run.aiTurnCount += 1;
    run.version += 1;
    run.currentAiTurn = null;
    delete run.pendingRoll;
    run.nextStep = "STUDENT_ROLL";
    const response = { run: publicRun(run) };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const submitLadderQuestion = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const locale = parseLocale(body.locale);
    const question = requireQuestion(body.question, locale);
    const questionHash = hashPrivateText("question", question);
    const startColumn = body.startColumn;
    const columnCount = run.mode === "SOLO" ? 4 : 2;
    if (
      typeof startColumn !== "number" ||
      !Number.isSafeInteger(startColumn) ||
      startColumn < 0 ||
      startColumn >= columnCount
    ) {
      throw new BrowserRunError("질문 사다리 시작점이 올바르지 않습니다", 400);
    }
    const actionFingerprint = fingerprint({
      action: "ladder-submit-question",
      locale,
      startColumn,
      questionHash,
    });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "ladder") {
      throw new BrowserRunError("질문을 등록할 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (locale !== run.locale) {
      throw new BrowserRunError("실행을 만든 언어로 질문해 주세요", 409);
    }
    if (run.questionHashes.includes(questionHash)) {
      throw new BrowserRunError("같은 질문은 다시 등록할 수 없습니다", 409);
    }

    run.questionCount += 1;
    run.version += 1;
    run.questionHashes.push(questionHash);
    if (run.questionCount === run.targetCount) settle(run);
    const response = {
      run: publicRun(run),
      ...(run.result ? { result: run.result } : {}),
    };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const submitKabaAttempt = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const locale = parseLocale(body.locale);
    const question = requireKabaAttempt(body.question);
    const questionHash = hashPrivateText("question", question);
    const actionFingerprint = fingerprint({
      action: "kaba-submit-attempt",
      locale,
      questionHash,
    });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "kaba") {
      throw new BrowserRunError("문장을 제출할 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (locale !== run.locale) {
      throw new BrowserRunError("실행을 만든 언어로 문장을 바꿔 주세요", 409);
    }
    if (
      run.kabaNextStep !== "STUDENT_ATTEMPT" ||
      run.questionCount >= run.targetCount ||
      !run.kabaSentencePlan[run.questionCount]
    ) {
      throw new BrowserRunError("지금은 문장을 제출할 차례가 아닙니다", 409);
    }

    const correct = isQuestionFormForLocale(question, locale);
    run.questionHashes.push(questionHash);
    run.questionCount += 1;
    if (correct) run.correctCount += 1;
    run.version += 1;
    if (run.questionCount === run.targetCount) settle(run);
    const response = {
      run: publicRun(run),
      correct,
      ...(run.result ? { result: run.result } : {}),
    };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const applyAction = (run: StoredRun, body: Record<string, unknown>) => {
    const requestId = requireRequestId(body.requestId);
    if (body.action === "relay-submit-question") {
      return submitQuestion(run, body, requestId);
    }
    if (body.action === "relay-record-ai-turn") {
      return recordAiTurn(run, body, requestId);
    }
    if (body.action === "dice-roll") {
      return rollDice(run, body, requestId);
    }
    if (body.action === "dice-submit-question") {
      return submitDiceQuestion(run, body, requestId);
    }
    if (body.action === "dice-record-ai-question") {
      return recordDiceAiQuestion(run, body, requestId);
    }
    if (body.action === "ladder-submit-question") {
      return submitLadderQuestion(run, body, requestId);
    }
    if (body.action === "kaba-submit-attempt") {
      return submitKabaAttempt(run, body, requestId);
    }
    throw new BrowserRunError("지원하지 않는 질문놀이 동작입니다", 400);
  };

  const issueAiTurn = (run: StoredRun, body: Record<string, unknown>) => {
    const requestId = requireRequestId(body.requestId);
    const expectedVersion = requireVersion(body.expectedVersion);
    const locale = parseLocale(body.locale);
    const topic = run.gameId === "relay" ? requireTopic(body.topic) : "";
    const previousQuestion = run.gameId === "relay"
      ? requireQuestion(body.previousQuestion, locale)
      : "";
    const issueFingerprint = fingerprint(run.gameId === "relay"
      ? { expectedVersion, locale, topic, previousQuestion }
      : { expectedVersion, locale });
    const replay = run.aiIssues.get(requestId);
    if (replay) {
      if (replay.fingerprint !== issueFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 인공지능 질문 정보가 들어왔습니다", 409);
      }
      if (expectedVersion !== run.version) {
        throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
      }
      return success(200, replay.response);
    }
    if (run.status !== "ACTIVE" || run.mode !== "AI") {
      throw new BrowserRunError("지금은 인공지능 질문 차례가 아닙니다", 409);
    }
    if (expectedVersion !== run.version || locale !== run.locale) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.gameId === "relay") {
      if (
        run.questionCount !== run.aiTurnCount + 1 ||
        run.questionCount >= run.targetCount
      ) {
        throw new BrowserRunError("지금은 인공지능 질문 차례가 아닙니다", 409);
      }
      if (topic !== run.topic) {
        throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
      }
      if (run.questions.at(-1) !== previousQuestion) {
        throw new BrowserRunError("직전 학생 질문이 실행 상태와 일치하지 않습니다", 409);
      }
    } else if (run.nextStep !== "AI_QUESTION" || run.pendingRoll?.actor !== "AI") {
      throw new BrowserRunError("지금은 인공지능 질문 차례가 아닙니다", 409);
    }
    if (run.currentAiTurn) {
      throw new BrowserRunError("인공지능 질문을 이미 만들고 있습니다", 409);
    }
    const diceFace = run.gameId === "dice" ? run.pendingRoll?.face : undefined;
    const issued: IssuedAiTurn = {
      generationRequestId: requestId,
      output: run.gameId === "dice"
        ? locale === "en"
          ? `What question fits dice face ${diceFace}?`
          : `주사위 ${diceFace}번에 맞는 질문은 무엇인가요?`
        : locale === "en"
          ? `What is connected AI question ${run.aiTurnCount + 1}?`
          : `인공지능 연결 질문 ${run.aiTurnCount + 1}은 무엇인가요?`,
      proof: `browser-proof-${randomUuid()}`,
      proofId: randomUuid(),
      expiresAt: "2099-12-31T23:59:59.000Z",
      runVersion: run.version,
      ...(diceFace ? { diceFace } : {}),
    };
    run.currentAiTurn = issued;
    const { diceFace: _diceFace, ...response } = issued;
    run.aiIssues.set(requestId, {
      fingerprint: issueFingerprint,
      response: cloneBody(response),
    });
    return success(200, response);
  };

  const completeRun = (run: StoredRun, body: Record<string, unknown>) => {
    const requestId = requireRequestId(body.requestId);
    const actionFingerprint = fingerprint({ action: "relay-complete" });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status === "SETTLED" && run.result) {
      return success(200, {
        run: publicRun(run),
        result: { ...run.result, alreadySettled: true },
        replayed: true,
      });
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (
      run.questionCount !== run.targetCount ||
      (run.mode === "AI" && run.aiTurnCount !== run.targetCount - 1)
    ) {
      throw new BrowserRunError("질문놀이의 정해진 차례를 모두 마쳐 주세요", 409);
    }
    settle(run);
    const response = { run: publicRun(run), result: run.result as RunResult };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const dispatch = (
    actor: BrowserQuestionGameRunActor,
    request: BrowserQuestionGameRunRequest,
  ): BrowserQuestionGameRunResponse => {
    try {
      if (RUN_COLLECTION_PATH.test(request.pathname)) {
        if (request.method !== "POST") {
          throw new BrowserRunError("허용하지 않는 요청입니다", 405);
        }
        return createRun(actor, request.body);
      }
      const match = request.pathname.match(RUN_OPERATION_PATH);
      if (!match) throw new BrowserRunError("질문놀이 실행 경로를 찾을 수 없습니다", 404);
      const [, runId, operation] = match;
      const run = ownedRun(actor, runId);
      if (operation === "result") {
        if (request.method !== "GET") {
          throw new BrowserRunError("허용하지 않는 요청입니다", 405);
        }
        return success(200, {
          run: publicRun(run),
          result: run.result
            ? { ...run.result, alreadySettled: run.status === "SETTLED" }
            : null,
        });
      }
      if (request.method !== "POST") {
        throw new BrowserRunError("허용하지 않는 요청입니다", 405);
      }
      if (operation === "actions") return applyAction(run, request.body);
      if (operation === "ai-turn") return issueAiTurn(run, request.body);
      return completeRun(run, request.body);
    } catch (error) {
      if (error instanceof BrowserRunError) {
        return { status: error.status, body: { error: error.message } };
      }
      throw error;
    }
  };

  return {
    dispatch,
    clear() {
      runs.clear();
      creations.clear();
      dailyEarned.clear();
    },
  };
}
