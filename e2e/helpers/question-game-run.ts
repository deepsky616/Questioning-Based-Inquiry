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
import {
  STORY_DICE_FALLBACK,
  STORY_DICE_FALLBACK_EN,
  type DiceCategory,
} from "../../src/lib/story-dice-data";

const RUN_COLLECTION_PATH = /^\/api\/question-games\/runs\/?$/;
const RUN_OPERATION_PATH =
  /^\/api\/question-games\/runs\/([^/]+)\/(actions|ai-turn|complete|result)\/?$/;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RunMode = "SOLO" | "AI";
type RunLocale = "ko" | "en";
type RunStatus = "ACTIVE" | "SETTLED";
type RunGameId = "relay" | "dice" | "ladder" | "kaba" | "story-dice" | "memory";
type DiceActor = "STUDENT" | "AI";
type DiceNextStep =
  | "STUDENT_ROLL"
  | "STUDENT_QUESTION"
  | "AI_ROLL"
  | "AI_QUESTION"
  | "COMPLETE";
type KabaNextStep = "STUDENT_ATTEMPT" | "COMPLETE";
type StoryDiceNextStep =
  | "ROLL"
  | "STORY"
  | "STUDENT_QUESTION"
  | "AI_QUESTION"
  | "STUDENT_ANSWER"
  | "COMPLETE";
type MemoryDifficulty = "easy" | "normal" | "hard";
type MemoryNextStep =
  | "STUDENT_QUESTION"
  | "STUDENT_ANSWER"
  | "AI_TURN"
  | "RESOLVE_MISS"
  | "COMPLETE";
type MemoryCardState = "HIDDEN" | "REVEALED" | "TAKEN";

interface MemoryCard {
  id: string;
  type: "q" | "a";
  contentKey: string;
  state: MemoryCardState;
}

interface MemoryMissReveal {
  id: string;
  actor: "STUDENT" | "AI";
  result: "MISS";
  resolveAt: number;
}

type StoryDiceWords = Record<DiceCategory, string[]>;
type StoryDiceRoll = Record<DiceCategory, string>;

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
  answerHashes: string[];
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
  storyDiceNextStep?: StoryDiceNextStep;
  storyWordPool?: StoryDiceWords;
  storyRolledWords?: StoryDiceRoll;
  storyHash?: string;
  pendingQuestionHash?: string;
  memoryDifficulty?: MemoryDifficulty;
  memoryNextStep?: MemoryNextStep;
  memoryQuestionCards?: MemoryCard[];
  memoryAnswerCards?: MemoryCard[];
  memoryMissReveal?: MemoryMissReveal;
  studentMatchCount: number;
  aiMatchCount: number;
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

function parseMemoryDifficulty(value: unknown): MemoryDifficulty {
  if (value === "easy" || value === "normal" || value === "hard") return value;
  throw new BrowserRunError("카드 짝 찾기 난이도가 올바르지 않습니다", 400);
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

function requireStory(value: unknown) {
  const story = typeof value === "string" ? value.trim() : "";
  const meaningfulCharacterCount = story.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  if (
    !story ||
    [...story].length > QUESTION_GAME_LIMITS.story ||
    meaningfulCharacterCount < 3
  ) {
    throw new BrowserRunError("이야기를 오백 자 안으로 알맞게 써 주세요", 400);
  }
  return story;
}

function requireStoryAnswer(value: unknown) {
  const answer = typeof value === "string" ? value.trim() : "";
  const meaningfulCharacterCount = answer.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  if (
    !answer ||
    [...answer].length > QUESTION_GAME_LIMITS.answer ||
    meaningfulCharacterCount < 2
  ) {
    throw new BrowserRunError("대답을 오백 자 안으로 알맞게 써 주세요", 400);
  }
  return answer;
}

function fingerprint(value: unknown) {
  return JSON.stringify(value);
}

function hashPrivateText(
  kind: "topic" | "question" | "story" | "answer" | "ai-context",
  value: string,
) {
  return createHash("sha256")
    .update(`browser-question-game:${kind}\0${value}`, "utf8")
    .digest("hex");
}

function normalizeStoryText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function createStoryWordPool(locale: RunLocale): StoryDiceWords {
  const source = locale === "en" ? STORY_DICE_FALLBACK_EN : STORY_DICE_FALLBACK;
  return {
    protagonist: [...source.protagonist.slice(0, 8)],
    place: [...source.place.slice(0, 8)],
    event: [...source.event.slice(0, 8)],
  };
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

const MEMORY_PAIR_COUNTS: Record<MemoryDifficulty, number> = {
  easy: 6,
  normal: 10,
  hard: 15,
};

function createMemoryCards(difficulty: MemoryDifficulty) {
  const pairCount = MEMORY_PAIR_COUNTS[difficulty];
  const makeCard = (type: "q" | "a", index: number): MemoryCard => ({
    id: `memory-${type}-${String(index + 1).padStart(2, "0")}`,
    type,
    contentKey: `memory-pair-${String(index + 1).padStart(2, "0")}`,
    state: "HIDDEN",
  });
  return {
    questions: Array.from({ length: pairCount }, (_, index) => makeCard("q", index)),
    answers: Array.from({ length: pairCount }, (_, index) => makeCard("a", index)),
  };
}

function publicMemoryCards(cards: MemoryCard[] | undefined) {
  return (cards ?? []).map(({ id, type, state, contentKey }) => ({
    id,
    type,
    state,
    ...(state === "HIDDEN" ? {} : { contentKey }),
  }));
}

function publicRun(run: StoredRun) {
  const awaitingAiTurn = run.gameId === "relay"
    ? run.status === "ACTIVE" &&
      run.mode === "AI" &&
      run.questionCount === run.aiTurnCount + 1 &&
      run.questionCount < run.targetCount
    : run.gameId === "dice"
      ? run.status === "ACTIVE" && run.mode === "AI" && run.nextStep === "AI_QUESTION"
      : run.gameId === "story-dice"
        ? run.status === "ACTIVE" &&
          run.mode === "AI" &&
          run.storyDiceNextStep === "AI_QUESTION"
        : run.gameId === "memory"
          ? run.status === "ACTIVE" &&
            run.mode === "AI" &&
            run.memoryNextStep === "AI_TURN"
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
    ...(run.gameId === "story-dice"
      ? {
          storyDiceNextStep: run.storyDiceNextStep,
          storyWordPool: run.storyWordPool,
          storyRolledWords: run.storyRolledWords ?? null,
        }
      : {}),
    ...(run.gameId === "memory"
      ? {
          memoryDifficulty: run.memoryDifficulty,
          memoryNextStep: run.memoryNextStep,
          studentMatchCount: run.studentMatchCount,
          aiMatchCount: run.aiMatchCount,
          memoryQuestionCards: publicMemoryCards(run.memoryQuestionCards),
          memoryAnswerCards: publicMemoryCards(run.memoryAnswerCards),
          memoryMissReveal: run.memoryMissReveal ?? null,
          memoryReview: run.status === "SETTLED"
            ? (run.memoryQuestionCards ?? []).map(({ contentKey }) => ({ contentKey }))
            : null,
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
    const requested = run.gameId === "memory"
      ? run.mode === "SOLO"
        ? run.studentMatchCount + 2
        : run.studentMatchCount * 2 + 3
      : validQuestionCount * policy.PER_VALID_QUESTION + policy.COMPLETION;
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
    if (run.gameId === "story-dice") {
      run.storyDiceNextStep = "COMPLETE";
      delete run.pendingQuestionHash;
    }
    if (run.gameId === "memory") {
      run.memoryNextStep = "COMPLETE";
      delete run.memoryMissReveal;
      for (const card of [
        ...(run.memoryQuestionCards ?? []),
        ...(run.memoryAnswerCards ?? []),
      ]) {
        if (card.state === "HIDDEN") card.state = "REVEALED";
      }
    }
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
      gameId !== "kaba" &&
      gameId !== "story-dice" &&
      gameId !== "memory"
    ) {
      throw new BrowserRunError("이 질문놀이는 서버 점수 기록을 아직 지원하지 않습니다", 409);
    }
    const mode = parseMode(body.mode);
    const locale = parseLocale(body.locale);
    const memoryDifficulty = gameId === "memory"
      ? parseMemoryDifficulty(body.difficulty)
      : undefined;
    const topic = gameId === "relay" ? requireTopic(body.topic) : "";
    const topicHashes = gameId === "ladder"
      ? requireLadderTopics(body.topics, mode)
      : [];
    const creationFingerprint = fingerprint({
      gameId,
      mode,
      locale,
      ...(memoryDifficulty ? { memoryDifficulty } : {}),
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

    const memoryCards = memoryDifficulty ? createMemoryCards(memoryDifficulty) : undefined;
    const targetCount = gameId === "memory"
      ? QUESTION_GAME_RULES.memory.targets[mode === "SOLO" ? "solo" : "ai"][memoryDifficulty!]
      : QUESTION_GAME_RULES[gameId].targets[mode === "SOLO" ? "solo" : "ai"].count;
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
      targetCount,
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
      answerHashes: [],
      correctCount: 0,
      studentMatchCount: 0,
      aiMatchCount: 0,
      expiresAt: "2099-12-31T23:59:59.000Z",
      completedAt: null,
      result: null,
      actions: new Map(),
      aiIssues: new Map(),
      currentAiTurn: null,
      ...(gameId === "dice" ? { nextStep: "STUDENT_ROLL" as const } : {}),
      ...(gameId === "kaba" ? { kabaNextStep: "STUDENT_ATTEMPT" as const } : {}),
      ...(gameId === "story-dice"
        ? {
            storyDiceNextStep: "ROLL" as const,
            storyWordPool: createStoryWordPool(locale),
          }
        : {}),
      ...(gameId === "memory" && memoryDifficulty && memoryCards
        ? {
            memoryDifficulty,
            memoryNextStep: "STUDENT_QUESTION" as const,
            memoryQuestionCards: memoryCards.questions,
            memoryAnswerCards: memoryCards.answers,
          }
        : {}),
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

  const rollStoryDice = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const actionFingerprint = fingerprint({ action: "story-dice-roll" });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "story-dice") {
      throw new BrowserRunError("이야기 주사위를 굴릴 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.storyDiceNextStep !== "ROLL" || !run.storyWordPool) {
      throw new BrowserRunError("이야기 주사위는 한 번만 굴릴 수 있습니다", 409);
    }

    run.storyRolledWords = {
      protagonist: run.storyWordPool.protagonist[0],
      place: run.storyWordPool.place[0],
      event: run.storyWordPool.event[0],
    };
    run.storyDiceNextStep = "STORY";
    run.version += 1;
    const response = { run: publicRun(run) };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const submitStoryDiceStory = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const locale = parseLocale(body.locale);
    const story = requireStory(body.story);
    const storyHash = hashPrivateText("story", story);
    const actionFingerprint = fingerprint({
      action: "story-dice-submit-story",
      locale,
      storyHash,
    });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "story-dice") {
      throw new BrowserRunError("이야기를 등록할 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (locale !== run.locale) {
      throw new BrowserRunError("실행을 만든 언어로 이야기를 써 주세요", 409);
    }
    if (run.storyDiceNextStep !== "STORY" || !run.storyRolledWords) {
      throw new BrowserRunError("이야기 주사위를 먼저 굴려 주세요", 409);
    }
    const normalizedStory = normalizeStoryText(story);
    if (!Object.values(run.storyRolledWords).every((word) =>
      normalizedStory.includes(normalizeStoryText(word)))) {
      throw new BrowserRunError("주사위로 나온 세 단어를 모두 넣어 이야기를 써 주세요", 400);
    }

    run.storyHash = storyHash;
    run.storyDiceNextStep = run.mode === "AI" ? "AI_QUESTION" : "STUDENT_QUESTION";
    run.version += 1;
    const response = { run: publicRun(run) };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const submitStoryDiceQuestion = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const locale = parseLocale(body.locale);
    const question = requireQuestion(body.question, locale);
    const questionHash = hashPrivateText("question", question);
    const actionFingerprint = fingerprint({
      action: "story-dice-submit-question",
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
    if (
      run.status !== "ACTIVE" ||
      run.gameId !== "story-dice" ||
      run.mode !== "SOLO"
    ) {
      throw new BrowserRunError("혼자 모드에서만 직접 질문을 쓸 수 있습니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (locale !== run.locale) {
      throw new BrowserRunError("실행을 만든 언어로 질문해 주세요", 409);
    }
    if (run.storyDiceNextStep !== "STUDENT_QUESTION") {
      throw new BrowserRunError("지금은 이야기 질문을 쓸 차례가 아닙니다", 409);
    }
    if (run.questionHashes.includes(questionHash)) {
      throw new BrowserRunError("같은 질문은 다시 등록할 수 없습니다", 409);
    }

    run.questionHashes.push(questionHash);
    run.pendingQuestionHash = questionHash;
    run.storyDiceNextStep = "STUDENT_ANSWER";
    run.version += 1;
    const response = { run: publicRun(run) };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const recordStoryDiceAiQuestion = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const generationRequestId = requireRequestId(body.generationRequestId);
    const output = requireQuestion(body.output, run.locale);
    const outputHash = hashPrivateText("question", output);
    const proof = typeof body.proof === "string" ? body.proof : "";
    const actionFingerprint = fingerprint({
      action: "story-dice-record-ai-question",
      generationRequestId,
      outputHash,
      proof,
    });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (
      run.status !== "ACTIVE" ||
      run.gameId !== "story-dice" ||
      run.mode !== "AI"
    ) {
      throw new BrowserRunError("인공지능 질문을 기록할 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (run.storyDiceNextStep !== "AI_QUESTION") {
      throw new BrowserRunError("지금은 인공지능 질문 차례가 아닙니다", 409);
    }
    const issued = run.currentAiTurn;
    if (
      !issued ||
      issued.generationRequestId !== generationRequestId ||
      issued.output !== output ||
      issued.proof !== proof ||
      run.questionHashes.includes(outputHash)
    ) {
      throw new BrowserRunError("인공지능 차례 증명이 실행 상태와 일치하지 않습니다", 409);
    }

    run.questionHashes.push(outputHash);
    run.pendingQuestionHash = outputHash;
    run.aiTurnCount += 1;
    run.storyDiceNextStep = "STUDENT_ANSWER";
    run.version += 1;
    run.currentAiTurn = null;
    const response = { run: publicRun(run) };
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const submitStoryDiceAnswer = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const locale = parseLocale(body.locale);
    const answer = requireStoryAnswer(body.answer);
    const answerHash = hashPrivateText("answer", answer);
    const actionFingerprint = fingerprint({
      action: "story-dice-submit-answer",
      locale,
      answerHash,
    });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "story-dice") {
      throw new BrowserRunError("대답을 등록할 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    if (locale !== run.locale) {
      throw new BrowserRunError("실행을 만든 언어로 대답해 주세요", 409);
    }
    if (run.storyDiceNextStep !== "STUDENT_ANSWER" || !run.pendingQuestionHash) {
      throw new BrowserRunError("이야기 질문을 먼저 만들어 주세요", 409);
    }

    run.answerHashes.push(answerHash);
    run.questionCount += 1;
    run.version += 1;
    delete run.pendingQuestionHash;
    if (run.questionCount === run.targetCount) {
      settle(run);
    } else {
      run.storyDiceNextStep = run.mode === "AI" ? "AI_QUESTION" : "STUDENT_QUESTION";
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

  const memoryCards = (run: StoredRun) => {
    if (
      run.gameId !== "memory" ||
      !run.memoryQuestionCards ||
      !run.memoryAnswerCards ||
      !run.memoryNextStep
    ) {
      throw new BrowserRunError("카드 짝 찾기 실행 상태가 올바르지 않습니다", 409);
    }
    return {
      questions: run.memoryQuestionCards,
      answers: run.memoryAnswerCards,
    };
  };

  const memoryResponse = (run: StoredRun) => ({
    run: publicRun(run),
    ...(run.result ? { result: run.result } : {}),
  });

  const rememberMemoryAction = (
    run: StoredRun,
    requestId: string,
    actionFingerprint: string,
  ) => {
    const response = memoryResponse(run);
    run.actions.set(requestId, {
      fingerprint: actionFingerprint,
      response: cloneBody(response),
    });
    return success(200, { ...response, replayed: false });
  };

  const flipMemoryCard = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const cardId = typeof body.cardId === "string" ? body.cardId : "";
    if (!cardId) throw new BrowserRunError("뒤집을 카드를 골라 주세요", 400);
    const actionFingerprint = fingerprint({ action: "memory-flip-card", cardId });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (run.status !== "ACTIVE" || run.gameId !== "memory") {
      throw new BrowserRunError("카드를 뒤집을 수 없는 실행입니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    const { questions, answers } = memoryCards(run);
    if (run.memoryNextStep === "STUDENT_QUESTION") {
      const card = questions.find(({ id }) => id === cardId);
      if (!card || card.state !== "HIDDEN") {
        throw new BrowserRunError("숨겨진 질문 카드를 골라 주세요", 409);
      }
      card.state = "REVEALED";
      run.memoryNextStep = "STUDENT_ANSWER";
      run.version += 1;
      return rememberMemoryAction(run, requestId, actionFingerprint);
    }
    if (run.memoryNextStep !== "STUDENT_ANSWER") {
      throw new BrowserRunError("지금은 학생이 카드를 뒤집을 차례가 아닙니다", 409);
    }
    const answer = answers.find(({ id }) => id === cardId);
    const question = questions.find(({ state }) => state === "REVEALED");
    if (!answer || answer.state !== "HIDDEN" || !question) {
      throw new BrowserRunError("숨겨진 대답 카드를 골라 주세요", 409);
    }

    answer.state = "REVEALED";
    run.questionCount += 1;
    run.version += 1;
    if (question.contentKey === answer.contentKey) {
      question.state = "TAKEN";
      answer.state = "TAKEN";
      run.studentMatchCount += 1;
      const allPairsFound = run.studentMatchCount + run.aiMatchCount >= questions.length;
      if (allPairsFound || run.questionCount >= run.targetCount) {
        settle(run);
      } else {
        run.memoryNextStep = "STUDENT_QUESTION";
      }
    } else {
      run.memoryMissReveal = {
        id: randomUuid(),
        actor: "STUDENT",
        result: "MISS",
        resolveAt: Date.now() + 1_800,
      };
      run.memoryNextStep = "RESOLVE_MISS";
    }
    return rememberMemoryAction(run, requestId, actionFingerprint);
  };

  const playMemoryAiTurn = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const actionFingerprint = fingerprint({ action: "memory-ai-turn" });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (
      run.status !== "ACTIVE" ||
      run.gameId !== "memory" ||
      run.mode !== "AI" ||
      run.memoryNextStep !== "AI_TURN"
    ) {
      throw new BrowserRunError("지금은 인공지능 카드 차례가 아닙니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    const { questions, answers } = memoryCards(run);
    const question = questions.find(({ state }) => state === "HIDDEN");
    const answer = question
      ? answers.find(({ state, contentKey }) =>
          state === "HIDDEN" && contentKey !== question.contentKey)
        ?? answers.find(({ state, contentKey }) =>
          state === "HIDDEN" && contentKey === question.contentKey)
      : undefined;
    if (!question || !answer) {
      throw new BrowserRunError("인공지능이 고를 카드를 찾을 수 없습니다", 409);
    }

    question.state = "REVEALED";
    answer.state = "REVEALED";
    run.questionCount += 1;
    run.aiTurnCount += 1;
    run.version += 1;
    if (question.contentKey === answer.contentKey) {
      question.state = "TAKEN";
      answer.state = "TAKEN";
      run.aiMatchCount += 1;
      const allPairsFound = run.studentMatchCount + run.aiMatchCount >= questions.length;
      if (allPairsFound || run.questionCount >= run.targetCount) {
        settle(run);
      } else {
        run.memoryNextStep = "AI_TURN";
      }
    } else {
      run.memoryMissReveal = {
        id: randomUuid(),
        actor: "AI",
        result: "MISS",
        resolveAt: Date.now() + 1_800,
      };
      run.memoryNextStep = "RESOLVE_MISS";
    }
    return rememberMemoryAction(run, requestId, actionFingerprint);
  };

  const resolveMemoryMiss = (
    run: StoredRun,
    body: Record<string, unknown>,
    requestId: string,
  ) => {
    const revealId = typeof body.revealId === "string" ? body.revealId : "";
    if (!revealId) throw new BrowserRunError("실패 공개 식별값이 올바르지 않습니다", 400);
    const actionFingerprint = fingerprint({ action: "memory-resolve-miss", revealId });
    const replay = run.actions.get(requestId);
    if (replay) {
      if (replay.fingerprint !== actionFingerprint) {
        throw new BrowserRunError("같은 요청 식별값에 다른 동작이 들어왔습니다", 409);
      }
      return replayResponse(replay);
    }
    if (
      run.status !== "ACTIVE" ||
      run.gameId !== "memory" ||
      run.memoryNextStep !== "RESOLVE_MISS" ||
      run.memoryMissReveal?.id !== revealId
    ) {
      throw new BrowserRunError("해소할 실패 공개가 실행 상태와 일치하지 않습니다", 409);
    }
    if (requireVersion(body.expectedVersion) !== run.version) {
      throw new BrowserRunError("질문놀이 실행 상태가 바뀌었습니다", 409);
    }
    const { questions, answers } = memoryCards(run);
    for (const card of [...questions, ...answers]) {
      if (card.state === "REVEALED") card.state = "HIDDEN";
    }
    const actor = run.memoryMissReveal.actor;
    delete run.memoryMissReveal;
    run.version += 1;
    if (run.questionCount >= run.targetCount) {
      settle(run);
    } else if (run.mode === "SOLO" || actor === "AI") {
      run.memoryNextStep = "STUDENT_QUESTION";
    } else {
      run.memoryNextStep = "AI_TURN";
    }
    return rememberMemoryAction(run, requestId, actionFingerprint);
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
    if (body.action === "story-dice-roll") {
      return rollStoryDice(run, body, requestId);
    }
    if (body.action === "story-dice-submit-story") {
      return submitStoryDiceStory(run, body, requestId);
    }
    if (body.action === "story-dice-submit-question") {
      return submitStoryDiceQuestion(run, body, requestId);
    }
    if (body.action === "story-dice-record-ai-question") {
      return recordStoryDiceAiQuestion(run, body, requestId);
    }
    if (body.action === "story-dice-submit-answer") {
      return submitStoryDiceAnswer(run, body, requestId);
    }
    if (body.action === "memory-flip-card") {
      return flipMemoryCard(run, body, requestId);
    }
    if (body.action === "memory-ai-turn") {
      return playMemoryAiTurn(run, body, requestId);
    }
    if (body.action === "memory-resolve-miss") {
      return resolveMemoryMiss(run, body, requestId);
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
    const story = run.gameId === "story-dice" ? requireStory(body.story) : "";
    const rawPreviousAnswer = typeof body.previousAnswer === "string"
      ? body.previousAnswer.trim()
      : "";
    const previousAnswer = run.gameId === "story-dice" && rawPreviousAnswer
      ? requireStoryAnswer(rawPreviousAnswer)
      : "";
    const storyHash = story ? hashPrivateText("story", story) : "";
    const previousAnswerHash = previousAnswer
      ? hashPrivateText("answer", previousAnswer)
      : hashPrivateText("ai-context", "story-dice:first-question");
    const issueFingerprint = fingerprint(
      run.gameId === "relay"
        ? { expectedVersion, locale, topic, previousQuestion }
        : run.gameId === "story-dice"
          ? { expectedVersion, locale, storyHash, previousAnswerHash }
          : { expectedVersion, locale },
    );
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
    } else if (run.gameId === "dice") {
      if (run.nextStep !== "AI_QUESTION" || run.pendingRoll?.actor !== "AI") {
        throw new BrowserRunError("지금은 인공지능 질문 차례가 아닙니다", 409);
      }
    } else if (run.gameId === "story-dice") {
      if (run.storyDiceNextStep !== "AI_QUESTION") {
        throw new BrowserRunError("지금은 인공지능 질문 차례가 아닙니다", 409);
      }
      if (storyHash !== run.storyHash) {
        throw new BrowserRunError("처음 작성한 이야기가 실행 상태와 일치하지 않습니다", 409);
      }
      const expectedPreviousAnswerHash = run.answerHashes.at(-1) ??
        hashPrivateText("ai-context", "story-dice:first-question");
      if (
        (run.questionCount === 0 && previousAnswer) ||
        (run.questionCount > 0 && !previousAnswer) ||
        previousAnswerHash !== expectedPreviousAnswerHash
      ) {
        throw new BrowserRunError("직전 학생 대답이 실행 상태와 일치하지 않습니다", 409);
      }
    } else {
      throw new BrowserRunError("이 질문놀이는 인공지능 차례를 지원하지 않습니다", 409);
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
        : run.gameId === "story-dice"
          ? locale === "en"
            ? `What could happen next in this story ${run.aiTurnCount + 1}?`
            : `이 이야기에서 다음에 일어날 일 ${run.aiTurnCount + 1}은 무엇인가요?`
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
    if (run.gameId === "memory") {
      throw new BrowserRunError("카드 짝 찾기는 마지막 동작에서 자동으로 정산됩니다", 409);
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
