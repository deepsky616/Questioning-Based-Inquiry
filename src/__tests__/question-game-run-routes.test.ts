import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredRun = {
  id: string;
  gameId: string;
  mode: string;
  ownerId: string | null;
  creationRequestId: string;
  creationRequestFingerprint: string;
  roomLifetimeKey: string | null;
  participants: unknown;
  status: string;
  state: unknown;
  version: number;
  scoreDate: string | null;
  completedAt: Date | null;
  settledAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type StoredActivity = {
  id: string;
  runId: string;
  actorId: string | null;
  requestId: string;
  requestFingerprint: string;
  sequence: number;
  type: string;
  payload: unknown;
  validQuestionCount: number;
  scoreValue: number;
  responseSnapshot: unknown;
  createdAt: Date;
};

type StoredPointLog = {
  studentId: string;
  gameId: string;
  gameRunId?: string | null;
  roomCode?: string | null;
  bonusType: string;
  points: number;
  reason: string;
  status: string;
  createdAt: Date;
};

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  checkRateLimit: vi.fn(),
  generateJson: vi.fn(),
  generateText: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  runFindFirst: vi.fn(),
  runFindMany: vi.fn(),
  runFindUnique: vi.fn(),
  runCount: vi.fn(),
  runCreate: vi.fn(),
  runUpdate: vi.fn(),
  activityFindUnique: vi.fn(),
  activityFindMany: vi.fn(),
  activityCreate: vi.fn(),
  activityAggregate: vi.fn(),
  activityCount: vi.fn(),
  pointAggregate: vi.fn(),
  pointCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/ai", () => ({
  generateJson: mocks.generateJson,
  generateText: mocks.generateText,
}));
vi.mock("@/lib/db", () => {
  const tx = {
    $queryRaw: mocks.queryRaw,
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    gameRun: {
      findFirst: mocks.runFindFirst,
      findMany: mocks.runFindMany,
      findUnique: mocks.runFindUnique,
      count: mocks.runCount,
      create: mocks.runCreate,
      update: mocks.runUpdate,
    },
    gameActivity: {
      findUnique: mocks.activityFindUnique,
      findMany: mocks.activityFindMany,
      create: mocks.activityCreate,
      aggregate: mocks.activityAggregate,
      count: mocks.activityCount,
    },
    pointLog: { aggregate: mocks.pointAggregate, create: mocks.pointCreate },
  };
  return { prisma: { ...tx, $transaction: mocks.transaction } };
});

import { POST as createRun } from "@/app/api/question-games/runs/route";
import { POST as applyAction } from "@/app/api/question-games/runs/[id]/actions/route";
import { POST as createAiTurn } from "@/app/api/question-games/runs/[id]/ai-turn/route";
import { POST as completeRun } from "@/app/api/question-games/runs/[id]/complete/route";
import { GET as getResult } from "@/app/api/question-games/runs/[id]/result/route";
import { traceLadderColumns } from "@/lib/question-ladder";
import {
  MYSTERY_ATTRIBUTES,
  getMysteryItem,
  mysteryQuestionForAttribute,
} from "@/lib/mystery-box-rules";
import {
  applyQuestionGameRunAction,
  isMysteryQuestionResolutionRequired,
} from "@/lib/question-game-run-service";

const CREATE_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_CREATE_ID = "00000000-0000-4000-8000-000000000002";
const THIRD_CREATE_ID = "00000000-0000-4000-8000-000000000003";
const FOURTH_CREATE_ID = "00000000-0000-4000-8000-000000000004";
const FIFTH_CREATE_ID = "00000000-0000-4000-8000-000000000005";
const ACTION_IDS = [
  "00000000-0000-4000-8000-000000000011",
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
];
const ALTERNATE_FINAL_ACTION_ID = "00000000-0000-4000-8000-000000000014";
const AI_TURN_IDS = [
  "00000000-0000-4000-8000-000000000031",
  "00000000-0000-4000-8000-000000000032",
];
const AI_RECORD_IDS = [
  "00000000-0000-4000-8000-000000000041",
  "00000000-0000-4000-8000-000000000042",
];
const DICE_ACTION_IDS = Array.from(
  { length: 10 },
  (_, index) => `00000000-0000-4000-8000-${String(61 + index).padStart(12, "0")}`,
);
const DICE_AI_TURN_IDS = [
  "00000000-0000-4000-8000-000000000081",
  "00000000-0000-4000-8000-000000000082",
];
const DICE_AI_RECORD_IDS = [
  "00000000-0000-4000-8000-000000000091",
  "00000000-0000-4000-8000-000000000092",
];
const LADDER_TOPICS = ["우주", "바다", "날씨", "식물"];
const KABA_ACTION_IDS = Array.from(
  { length: 10 },
  (_, index) => `00000000-0000-4000-8000-${String(201 + index).padStart(12, "0")}`,
);
const KABA_ALTERNATE_FINAL_ACTION_ID = "00000000-0000-4000-8000-000000000221";
const KABA_VALID_QUESTIONS = {
  ko: [
    "고양이가 자나요?", "개미가 걷나요?", "토끼가 뛰나요?", "꽃이 예쁜가요?", "사과가 빨간가요?",
    "하늘이 파란가요?", "비가 오나요?", "새가 날아가나요?", "강아지가 짖나요?", "물고기가 헤엄치나요?",
    "아이가 웃나요?", "나무가 흔들리나요?", "별이 빛나나요?", "바람이 부나요?", "눈이 내리나요?",
    "나비가 날개를 펴나요?", "달이 밝은가요?", "파도가 치나요?", "벌이 꿀을 모으나요?", "원숭이가 나무에 오르나요?",
    "햇빛이 따뜻한가요?", "구름이 하얀가요?", "고래가 바다에 사나요?", "개구리가 우나요?", "아기 새가 둥지에 있나요?",
  ],
  en: [
    "Does the cat sleep?", "Does the ant walk?", "Does the rabbit jump?", "Is the flower pretty?", "Is the apple red?",
    "Is the sky blue?", "Does it rain?", "Does the bird fly away?", "Does the dog bark?", "Does the fish swim?",
    "Does the child smile?", "Does the tree shake?", "Does the star shine?", "Does the wind blow?", "Does snow fall?",
    "Does the butterfly open its wings?", "Is the moon bright?", "Does the wave crash?", "Does the bee collect nectar?", "Does the monkey climb a tree?",
    "Is the sunlight warm?", "Are the clouds white?", "Does the whale live in the ocean?", "Does the frog croak?", "Is the baby bird in the nest?",
  ],
} as const;
const STORY_ACTION_IDS = Array.from(
  { length: 8 },
  (_, index) => `00000000-0000-4000-8000-${String(301 + index).padStart(12, "0")}`,
);
const STORY_ALTERNATE_FINAL_ACTION_ID = "00000000-0000-4000-8000-000000000309";
const STORY_AI_TURN_IDS = Array.from(
  { length: 3 },
  (_, index) => `00000000-0000-4000-8000-${String(321 + index).padStart(12, "0")}`,
);
const STORY_AI_RECORD_IDS = Array.from(
  { length: 3 },
  (_, index) => `00000000-0000-4000-8000-${String(331 + index).padStart(12, "0")}`,
);
const MEMORY_ACTION_IDS = Array.from(
  { length: 128 },
  (_, index) => `00000000-0000-4000-8000-${String(401 + index).padStart(12, "0")}`,
);
const MEMORY_ALTERNATE_FINAL_ACTION_ID = "00000000-0000-4000-8000-000000000539";
const MYSTERY_ACTION_IDS = Array.from(
  { length: 80 },
  (_, index) => `00000000-0000-4000-8000-${String(601 + index).padStart(12, "0")}`,
);
const MYSTERY_ALTERNATE_FINAL_ACTION_ID = "00000000-0000-4000-8000-000000000699";
const COMPLETE_ID = "00000000-0000-4000-8000-000000000020";

const users = new Map<string, { id: string; role: string; totalPoints: number }>();
const runs = new Map<string, StoredRun>();
const activities: StoredActivity[] = [];
const pointLogs: StoredPointLog[] = [];
let userUpdateLock: Promise<void> = Promise.resolve();
const runUpdateLocks = new Map<string, Promise<void>>();
let databaseClock = new Date();
let transactionDepth = 0;

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params(id = "run-1") {
  return { params: Promise.resolve({ id }) };
}

async function postCreate(body: unknown) {
  return createRun(jsonRequest("/api/question-games/runs", body) as never);
}

async function postAction(body: unknown, id = "run-1") {
  return applyAction(
    jsonRequest(`/api/question-games/runs/${id}/actions`, body) as never,
    params(id),
  );
}

async function postComplete(body: unknown, id = "run-1") {
  return completeRun(
    jsonRequest(`/api/question-games/runs/${id}/complete`, body) as never,
    params(id),
  );
}

async function postAiTurn(body: unknown, id = "run-1") {
  return createAiTurn(
    jsonRequest(`/api/question-games/runs/${id}/ai-turn`, body) as never,
    params(id),
  );
}

async function readResult(id = "run-1") {
  return getResult(new Request(`http://localhost/api/question-games/runs/${id}/result`) as never, params(id));
}

async function createRelay(mode: "solo" | "ai" = "solo") {
  return postCreate({
    gameId: "relay",
    mode,
    requestId: CREATE_ID,
    topic: "우주",
    locale: "ko",
  });
}

async function createDice(mode: "solo" | "ai" = "solo") {
  return postCreate({
    gameId: "dice",
    mode,
    requestId: CREATE_ID,
    locale: "ko",
  });
}

async function createLadder(
  mode: "solo" | "ai" = "solo",
  topics = mode === "solo" ? LADDER_TOPICS : LADDER_TOPICS.slice(0, 2),
) {
  return postCreate({
    gameId: "ladder",
    mode,
    requestId: CREATE_ID,
    topics,
    locale: "ko",
  });
}

async function createKaba(
  mode: "solo" | "ai" = "solo",
  locale: "ko" | "en" = "ko",
) {
  return postCreate({
    gameId: "kaba",
    mode,
    requestId: CREATE_ID,
    locale,
  });
}

async function createStoryDice(
  mode: "solo" | "ai" = "solo",
  locale: "ko" | "en" = "ko",
) {
  return postCreate({
    gameId: "story-dice",
    mode,
    requestId: CREATE_ID,
    locale,
  });
}

async function createMemory(
  mode: "solo" | "ai" = "solo",
  difficulty: "easy" | "normal" | "hard" = "easy",
  locale: "ko" | "en" = "ko",
) {
  return postCreate({
    gameId: "memory",
    mode,
    difficulty,
    requestId: CREATE_ID,
    locale,
  });
}

async function createMystery(
  mode: "solo" | "ai" = "solo",
  locale: "ko" | "en" = "ko",
) {
  return postCreate({
    gameId: "mystery-box",
    mode,
    requestId: CREATE_ID,
    locale,
  });
}

type TestMysteryState = {
  privateItemId: string;
  mysteryLocale: "ko" | "en";
  questionCount: number;
  mysteryNextStep: "STUDENT_ACTION" | "AI_TURN" | "COMPLETE";
  history: Array<Record<string, unknown>>;
};

function storedMysteryState(id = "run-1") {
  const state = runs.get(id)?.state as TestMysteryState | undefined;
  if (!state) throw new Error("missing mystery state");
  return state;
}

function mysterySecret(id = "run-1") {
  const state = storedMysteryState(id);
  const item = getMysteryItem(state.privateItemId);
  if (!item) throw new Error("missing mystery item");
  return item;
}

async function submitMysteryQuestion(
  actionIndex: number,
  expectedVersion: number,
  question: string,
  locale: "ko" | "en" = "ko",
  id = "run-1",
  requestId = MYSTERY_ACTION_IDS[actionIndex],
) {
  return postAction({
    action: "mystery-submit-question",
    requestId,
    expectedVersion,
    locale,
    question,
  }, id);
}

async function submitMysteryGuess(
  actionIndex: number,
  expectedVersion: number,
  guess: string,
  locale: "ko" | "en" = "ko",
  id = "run-1",
  requestId = MYSTERY_ACTION_IDS[actionIndex],
) {
  return postAction({
    action: "mystery-submit-guess",
    requestId,
    expectedVersion,
    locale,
    guess,
  }, id);
}

async function runMysteryAiTurn(
  actionIndex: number,
  expectedVersion: number,
  extra: Record<string, unknown> = {},
  id = "run-1",
) {
  return postAction({
    action: "mystery-ai-turn",
    requestId: MYSTERY_ACTION_IDS[actionIndex],
    expectedVersion,
    ...extra,
  }, id);
}

type TestMemoryState = {
  qCards: Array<{ id: string; pairKey: string; type: "q" }>;
  aCards: Array<{ id: string; pairKey: string; type: "a" }>;
  pairs: Array<{ pairKey: string; contentKey: string }>;
  pendingMiss?: { id: string; actor: "STUDENT" | "AI"; resolveAt: number };
  seenCardIds: string[];
};

function storedMemoryState(id = "run-1") {
  const state = runs.get(id)?.state as TestMemoryState | undefined;
  if (!state) throw new Error("missing memory state");
  return state;
}

function memoryPairCards(index: number, id = "run-1") {
  const state = storedMemoryState(id);
  const pair = state.pairs[index];
  const question = state.qCards.find(({ pairKey }) => pairKey === pair?.pairKey);
  const answer = state.aCards.find(({ pairKey }) => pairKey === pair?.pairKey);
  if (!pair || !question || !answer) throw new Error("missing memory pair");
  return { pair, question, answer };
}

async function flipMemoryCard(
  actionIndex: number,
  expectedVersion: number,
  cardId: string,
  id = "run-1",
  requestId = MEMORY_ACTION_IDS[actionIndex],
) {
  return postAction({
    action: "memory-flip-card",
    requestId,
    expectedVersion,
    cardId,
  }, id);
}

async function runMemoryAiTurn(
  actionIndex: number,
  expectedVersion: number,
  id = "run-1",
  extra: Record<string, unknown> = {},
) {
  return postAction({
    action: "memory-ai-turn",
    requestId: MEMORY_ACTION_IDS[actionIndex],
    expectedVersion,
    ...extra,
  }, id);
}

async function resolveMemoryMiss(
  actionIndex: number,
  expectedVersion: number,
  revealId: string,
  id = "run-1",
) {
  return postAction({
    action: "memory-resolve-miss",
    requestId: MEMORY_ACTION_IDS[actionIndex],
    expectedVersion,
    revealId,
  }, id);
}

async function playAllStudentMemoryMatches(mode: "solo" | "ai" = "solo") {
  await createMemory(mode);
  const responses: Response[] = [];
  let version = 1;
  for (let index = 0; index < 6; index += 1) {
    const { question, answer } = memoryPairCards(index);
    responses.push(await flipMemoryCard(index * 2, version, question.id));
    version += 1;
    responses.push(await flipMemoryCard(index * 2 + 1, version, answer.id));
    version += 1;
  }
  return { responses, version };
}

async function rollStoryDiceRun(
  expectedVersion = 1,
  requestId = STORY_ACTION_IDS[0],
  id = "run-1",
) {
  return postAction({
    action: "story-dice-roll",
    requestId,
    expectedVersion,
  }, id);
}

async function submitStoryDiceStory(
  story: string,
  expectedVersion = 2,
  requestId = STORY_ACTION_IDS[1],
  id = "run-1",
  locale: "ko" | "en" = "ko",
) {
  return postAction({
    action: "story-dice-submit-story",
    requestId,
    expectedVersion,
    story,
    locale,
  }, id);
}

async function submitStoryDiceQuestion(
  index: number,
  expectedVersion: number,
  question: string,
  id = "run-1",
  requestId = STORY_ACTION_IDS[2 + index * 2],
) {
  return postAction({
    action: "story-dice-submit-question",
    requestId,
    expectedVersion,
    question,
    locale: "ko",
  }, id);
}

async function submitStoryDiceAnswer(
  index: number,
  expectedVersion: number,
  answer: string,
  id = "run-1",
  requestId = STORY_ACTION_IDS[3 + index * 2],
) {
  return postAction({
    action: "story-dice-submit-answer",
    requestId,
    expectedVersion,
    answer,
    locale: "ko",
  }, id);
}

async function requestStoryDiceAiQuestion(
  index: number,
  expectedVersion: number,
  story: string,
  previousAnswer: string,
  id = "run-1",
) {
  return postAiTurn({
    requestId: STORY_AI_TURN_IDS[index],
    expectedVersion,
    story,
    previousAnswer,
    locale: "ko",
  }, id);
}

async function recordStoryDiceAiQuestion(
  index: number,
  expectedVersion: number,
  output: string,
  proof: string,
  id = "run-1",
) {
  return postAction({
    action: "story-dice-record-ai-question",
    requestId: STORY_AI_RECORD_IDS[index],
    generationRequestId: STORY_AI_TURN_IDS[index],
    expectedVersion,
    output,
    proof,
  }, id);
}

function storyForRolledWords(rolled: {
  protagonist: string;
  place: string;
  event: string;
}) {
  return `${rolled.protagonist}가 ${rolled.place}에서 ${rolled.event}을 발견했어요.`;
}

async function prepareStoryDice(mode: "solo" | "ai" = "solo") {
  await createStoryDice(mode);
  const rolledResponse = await rollStoryDiceRun();
  const rolledBody = await rolledResponse.json() as {
    run: { storyRolledWords: { protagonist: string; place: string; event: string } };
  };
  const story = storyForRolledWords(rolledBody.run.storyRolledWords);
  await submitStoryDiceStory(story);
  return { story, rolled: rolledBody.run.storyRolledWords };
}

async function playSoloStoryDice() {
  const prepared = await prepareStoryDice("solo");
  const questions = [
    "주인공은 왜 그곳에 갔나요?",
    "발견한 물건은 어떻게 빛났나요?",
    "마지막에는 어떤 일이 생겼나요?",
  ];
  const answers = [
    "친구를 만나러 갔어요.",
    "별처럼 밝게 빛났어요.",
    "모두 함께 집으로 돌아왔어요.",
  ];
  const responses: Response[] = [];
  for (let index = 0; index < 3; index += 1) {
    responses.push(await submitStoryDiceQuestion(index, 3 + index * 2, questions[index]));
    responses.push(await submitStoryDiceAnswer(index, 4 + index * 2, answers[index]));
  }
  return { ...prepared, questions, answers, responses };
}

async function playAiStoryDice() {
  const prepared = await prepareStoryDice("ai");
  const outputs = [
    "주인공은 왜 그곳에 갔나요?",
    "그 물건은 어떻게 빛났나요?",
    "이야기는 어떻게 끝났나요?",
  ];
  const answers = [
    "친구를 만나러 갔어요.",
    "별처럼 밝게 빛났어요.",
    "모두 함께 집으로 돌아왔어요.",
  ];
  mocks.generateText
    .mockResolvedValueOnce(outputs[0])
    .mockResolvedValueOnce(outputs[1])
    .mockResolvedValueOnce(outputs[2]);
  const responses: Response[] = [];
  let previousAnswer = "";
  for (let index = 0; index < 3; index += 1) {
    const issueVersion = 3 + index * 2;
    const issued = await requestStoryDiceAiQuestion(
      index,
      issueVersion,
      prepared.story,
      previousAnswer,
    );
    const issuedBody = await issued.json() as { output: string; proof: string };
    responses.push(issued);
    responses.push(await recordStoryDiceAiQuestion(
      index,
      issueVersion,
      issuedBody.output,
      issuedBody.proof,
    ));
    responses.push(await submitStoryDiceAnswer(index, issueVersion + 1, answers[index]));
    previousAnswer = answers[index];
  }
  return { ...prepared, outputs, answers, responses };
}

async function submitKabaAttempt(
  index: number,
  question?: string,
  expectedVersion = index + 1,
  id = "run-1",
  locale: "ko" | "en" = "ko",
  extra: Record<string, unknown> = {},
) {
  const state = runs.get(id)?.state as {
    questionCount: number;
    sentencePlan: string[];
  } | undefined;
  const sentenceKey = state?.sentencePlan[state.questionCount];
  const sentenceIndex = sentenceKey ? Number(sentenceKey.slice(-2)) - 1 : -1;
  const resolvedQuestion = question ?? KABA_VALID_QUESTIONS[locale][sentenceIndex];
  if (!resolvedQuestion) throw new Error("missing kaba test question");
  return postAction({
    action: "kaba-submit-attempt",
    requestId: KABA_ACTION_IDS[index],
    expectedVersion,
    question: resolvedQuestion,
    locale,
    ...extra,
  }, id);
}

async function submitLadderQuestion(
  index: number,
  expectedVersion = index + 1,
  question = `사다리 질문 ${index + 1}은 왜 필요할까요?`,
  startColumn = 0,
  id = "run-1",
) {
  return postAction({
    action: "ladder-submit-question",
    requestId: ACTION_IDS[index],
    expectedVersion,
    startColumn,
    question,
    locale: "ko",
  }, id);
}

async function rollDice(index: number, expectedVersion: number, id = "run-1") {
  return postAction({
    action: "dice-roll",
    requestId: DICE_ACTION_IDS[index],
    expectedVersion,
    face: 6,
  }, id);
}

async function submitDiceQuestion(
  index: number,
  expectedVersion: number,
  question = `주사위 질문 ${index + 1}은 왜 필요할까요?`,
  id = "run-1",
) {
  return postAction({
    action: "dice-submit-question",
    requestId: DICE_ACTION_IDS[index],
    expectedVersion,
    question,
    locale: "ko",
    face: 6,
  }, id);
}

async function requestDiceAiQuestion(
  index: number,
  expectedVersion: number,
  id = "run-1",
) {
  return postAiTurn({
    requestId: DICE_AI_TURN_IDS[index],
    expectedVersion,
    locale: "ko",
  }, id);
}

async function recordDiceAiQuestion(
  index: number,
  expectedVersion: number,
  output: string,
  proof: string,
  id = "run-1",
) {
  return postAction({
    action: "dice-record-ai-question",
    requestId: DICE_AI_RECORD_IDS[index],
    generationRequestId: DICE_AI_TURN_IDS[index],
    expectedVersion,
    output,
    proof,
  }, id);
}

async function submitQuestion(
  index: number,
  question = `왜 질문 ${index + 1}이 필요할까요?`,
  id = "run-1",
  expectedVersion = index + 1,
) {
  return postAction({
    action: "relay-submit-question",
    requestId: ACTION_IDS[index],
    expectedVersion,
    question,
    locale: "ko",
    validQuestions: 999_999,
    completed: true,
  }, id);
}


async function requestAiTurn(
  index: number,
  expectedVersion: number,
  previousQuestion: string,
  id = "run-1",
) {
  return postAiTurn({
    requestId: AI_TURN_IDS[index],
    expectedVersion,
    topic: "우주",
    previousQuestion,
    locale: "ko",
  }, id);
}

async function recordAiTurn(
  index: number,
  expectedVersion: number,
  output: string,
  proof: string,
  id = "run-1",
) {
  return postAction({
    action: "relay-record-ai-turn",
    requestId: AI_RECORD_IDS[index],
    generationRequestId: AI_TURN_IDS[index],
    expectedVersion,
    output,
    proof,
  }, id);
}

async function playVerifiedAiRelay(id = "run-1") {
  const questions = [
    "별은 왜 밤에 더 잘 보일까요?",
    "별빛은 지구까지 얼마나 걸려 올까요?",
    "별의 색은 왜 서로 다를까요?",
  ];
  const outputs = [
    "그렇다면 별빛은 어디에서 시작될까요?",
    "그 빛의 거리는 어떻게 알아낼 수 있을까요?",
  ];
  mocks.generateText
    .mockResolvedValueOnce(outputs[0])
    .mockResolvedValueOnce(outputs[1]);

  const studentOne = await submitQuestion(0, questions[0], id, 1);
  const issuedOne = await requestAiTurn(0, 2, questions[0], id);
  const proofOne = await issuedOne.json() as { output: string; proof: string };
  const aiOne = await recordAiTurn(0, 2, proofOne.output, proofOne.proof, id);
  const studentTwo = await submitQuestion(1, questions[1], id, 3);
  const issuedTwo = await requestAiTurn(1, 4, questions[1], id);
  const proofTwo = await issuedTwo.json() as { output: string; proof: string };
  const aiTwo = await recordAiTurn(1, 4, proofTwo.output, proofTwo.proof, id);
  const studentThree = await submitQuestion(2, questions[2], id, 5);

  return {
    questions,
    outputs,
    responses: [studentOne, issuedOne, aiOne, studentTwo, issuedTwo, aiTwo, studentThree],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  users.clear();
  runs.clear();
  activities.splice(0);
  pointLogs.splice(0);
  userUpdateLock = Promise.resolve();
  runUpdateLocks.clear();
  databaseClock = new Date();
  transactionDepth = 0;
  users.set("student-1", { id: "student-1", role: "STUDENT", totalPoints: 0 });
  users.set("student-2", { id: "student-2", role: "STUDENT", totalPoints: 0 });
  users.set("teacher-1", { id: "teacher-1", role: "TEACHER", totalPoints: 0 });
  mocks.auth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
  mocks.checkRateLimit.mockReturnValue(null);
  mocks.generateJson.mockResolvedValue({ answer: "yes" });
  mocks.generateText.mockResolvedValue("그렇다면 별빛은 어디에서 시작될까요?");
  process.env.GAME_ACTIVITY_HASH_SECRET = "question-game-run-test-secret";

  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
    const releases: Array<() => void> = [];
    let snapshot: {
      users: Map<string, { id: string; role: string; totalPoints: number }>;
      runs: Map<string, StoredRun>;
      activities: StoredActivity[];
      pointLogs: StoredPointLog[];
    } | null = null;
    const captureSnapshot = () => {
      if (snapshot) return;
      snapshot = {
        users: structuredClone(users),
        runs: structuredClone(runs),
        activities: structuredClone(activities),
        pointLogs: structuredClone(pointLogs),
      };
    };
    const queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      mocks.queryRaw(strings, ...values);
      const sql = strings.join("?");
      if (sql.includes('FROM "users"') && sql.includes("FOR UPDATE")) {
        const previous = userUpdateLock;
        let release = () => {};
        userUpdateLock = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        captureSnapshot();
        releases.push(release);
      }
      if (sql.includes('FROM "game_runs"') && sql.includes("FOR UPDATE")) {
        const runId = typeof values[0] === "string" ? values[0] : "unknown";
        const previous = runUpdateLocks.get(runId) ?? Promise.resolve();
        let release = () => {};
        runUpdateLocks.set(runId, new Promise<void>((resolve) => { release = resolve; }));
        await previous;
        captureSnapshot();
        releases.push(release);
      }
      if (sql.includes("clock_timestamp()")) {
        return [{ now: new Date(databaseClock) }];
      }
      return [];
    };
    transactionDepth += 1;
    try {
      return await callback({
        $queryRaw: queryRaw,
        user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
        gameRun: {
          findFirst: mocks.runFindFirst,
          findMany: mocks.runFindMany,
          findUnique: mocks.runFindUnique,
          count: mocks.runCount,
          create: mocks.runCreate,
          update: mocks.runUpdate,
        },
        gameActivity: {
          findUnique: mocks.activityFindUnique,
          findMany: mocks.activityFindMany,
          create: mocks.activityCreate,
          aggregate: mocks.activityAggregate,
          count: mocks.activityCount,
        },
        pointLog: { aggregate: mocks.pointAggregate, create: mocks.pointCreate },
      });
    } catch (error) {
      const rollbackSnapshot = snapshot as {
        users: Map<string, { id: string; role: string; totalPoints: number }>;
        runs: Map<string, StoredRun>;
        activities: StoredActivity[];
        pointLogs: StoredPointLog[];
      } | null;
      if (rollbackSnapshot) {
        users.clear();
        for (const [id, user] of rollbackSnapshot.users) users.set(id, user);
        runs.clear();
        for (const [id, run] of rollbackSnapshot.runs) runs.set(id, run);
        activities.splice(0, activities.length, ...rollbackSnapshot.activities);
        pointLogs.splice(0, pointLogs.length, ...rollbackSnapshot.pointLogs);
      }
      throw error;
    } finally {
      transactionDepth -= 1;
      releases.reverse().forEach((release) => release());
    }
  });
  mocks.queryRaw.mockResolvedValue([]);
  mocks.userFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null);
  mocks.userUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: { totalPoints: { increment: number } } }) => {
    const user = users.get(where.id);
    if (!user) throw new Error("missing user");
    user.totalPoints += data.totalPoints.increment;
    return user;
  });
  mocks.runFindFirst.mockImplementation(async ({ where }: { where: { ownerId: string; creationRequestId: string } }) =>
    [...runs.values()].find((run) =>
      run.ownerId === where.ownerId && run.creationRequestId === where.creationRequestId) ?? null,
  );
  mocks.runFindMany.mockImplementation(async ({ where, take }: {
    where: { ownerId: string; status: string; expiresAt: { gt: Date } };
    take: number;
  }) => [...runs.values()]
    .filter((run) =>
      run.ownerId === where.ownerId &&
      run.status === where.status &&
      run.expiresAt > where.expiresAt.gt
    )
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
    .slice(0, take));
  mocks.runFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => runs.get(where.id) ?? null);
  mocks.runCount.mockImplementation(async ({ where }: {
    where: { ownerId: string; status: string; expiresAt: { gt: Date } };
  }) => [...runs.values()].filter((run) =>
    run.ownerId === where.ownerId &&
    run.status === where.status &&
    run.expiresAt > where.expiresAt.gt
  ).length);
  mocks.runCreate.mockImplementation(async ({ data }: { data: Omit<StoredRun, "id" | "createdAt" | "updatedAt"> }) => {
    const now = new Date(1_000 + runs.size);
    const run: StoredRun = { id: `run-${runs.size + 1}`, createdAt: now, updatedAt: now, ...data };
    runs.set(run.id, run);
    return run;
  });
  mocks.runUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<StoredRun> }) => {
    const run = runs.get(where.id);
    if (!run) throw new Error("missing run");
    Object.assign(run, data, { updatedAt: new Date() });
    return run;
  });
  mocks.activityFindUnique.mockImplementation(async ({ where }: { where: { uniq_game_activity_request: { runId: string; requestId: string } } }) => {
    const key = where.uniq_game_activity_request;
    return activities.find((activity) => activity.runId === key.runId && activity.requestId === key.requestId) ?? null;
  });
  mocks.activityFindMany.mockImplementation(async ({ where }: {
    where: { runId: string; type?: { in: string[] } };
  }) => activities
    .filter((activity) =>
      activity.runId === where.runId &&
      (!where.type || where.type.in.includes(activity.type))
    )
    .sort((left, right) => left.sequence - right.sequence));
  mocks.activityCreate.mockImplementation(async ({ data }: { data: Omit<StoredActivity, "id" | "createdAt"> }) => {
    const activity: StoredActivity = { id: `activity-${activities.length + 1}`, createdAt: new Date(), ...data };
    activities.push(activity);
    return activity;
  });
  mocks.activityAggregate.mockImplementation(async ({ where }: { where: { runId: string; type: string } }) => ({
    _sum: {
      validQuestionCount: activities
        .filter((activity) => activity.runId === where.runId && activity.type === where.type)
        .reduce((sum, activity) => sum + activity.validQuestionCount, 0),
    },
  }));
  mocks.activityCount.mockImplementation(async ({ where }: { where: { runId: string; type: string } }) =>
    activities.filter((activity) => activity.runId === where.runId && activity.type === where.type).length,
  );
  mocks.pointAggregate.mockImplementation(async ({ where }: {
    where: {
      studentId: string;
      gameId: string;
      status: { in: string[] };
      createdAt: { gte: Date; lt: Date };
    };
  }) => ({
    _sum: {
      points: pointLogs
        .filter((log) =>
          log.studentId === where.studentId &&
          log.gameId === where.gameId &&
          where.status.in.includes(log.status) &&
          log.createdAt >= where.createdAt.gte &&
          log.createdAt < where.createdAt.lt
        )
        .reduce((sum, log) => sum + log.points, 0),
    },
  }));
  mocks.pointCreate.mockImplementation(async ({ data }: { data: StoredPointLog }) => {
    pointLogs.push(data);
    return data;
  });
});

describe("질문놀이 서버 실행 경로", () => {
  it("비로그인 사용자는 실행을 만들 수 없다", async () => {
    mocks.auth.mockResolvedValue(null);

    expect((await createRelay()).status).toBe(401);
    expect(runs).toHaveLength(0);
  });

  it("선언한 본문 크기가 팔 킬로바이트를 넘으면 본문을 읽지 않는다", async () => {
    const text = vi.fn().mockResolvedValue("{}");
    const response = await createRun({
      headers: new Headers({ "content-length": String(8 * 1024 + 1) }),
      text,
    } as never);

    expect(response.status).toBe(413);
    expect(text).not.toHaveBeenCalled();
    expect(runs).toHaveLength(0);
  });

  it("실제 명령 본문이 팔 킬로바이트를 넘으면 실행을 저장하지 않는다", async () => {
    const response = await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: CREATE_ID,
      topic: "우주",
      locale: "ko",
      padding: "x".repeat(8 * 1024),
    });

    expect(response.status).toBe(413);
    expect(runs).toHaveLength(0);
  });

  it("인공지능 차례 본문도 팔 킬로바이트를 넘으면 모델을 호출하지 않는다", async () => {
    const response = await postAiTurn({ padding: "x".repeat(8 * 1024) });

    expect(response.status).toBe(413);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("실행 생성과 동작, 완료, 결과 조회를 경로별 횟수로 제한한다", async () => {
    mocks.checkRateLimit.mockReturnValue(new Response(null, { status: 429 }));

    const responses = await Promise.all([
      createRelay(),
      submitQuestion(0),
      postAiTurn({}),
      postComplete({ requestId: COMPLETE_ID, expectedVersion: 1 }),
      readResult(),
    ]);

    expect(responses.map((response) => response.status)).toEqual([429, 429, 429, 429, 429]);
    expect(mocks.checkRateLimit.mock.calls).toEqual([
      ["question-game-run-create:student-1", 10],
      ["question-game-run-action:student-1", 120],
      ["question-game-run-ai-turn:student-1", 20],
      ["question-game-run-complete:student-1", 10],
      ["question-game-run-result:student-1", 120],
    ]);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["P2002", "P2034"])(
    "거래 충돌 %s가 세 번 이어지면 내부 오류 없이 충돌 응답을 반환한다",
    async (code) => {
      mocks.transaction.mockRejectedValue({ code, message: "private-database-value" });

      const response = await createRelay();
      const body = await response.json() as { error: string };

      expect(response.status).toBe(409);
      expect(body.error).toBe("질문놀이 실행이 동시에 변경되었습니다. 다시 시도해 주세요");
      expect(JSON.stringify(body)).not.toContain("private-database-value");
      expect(mocks.transaction).toHaveBeenCalledTimes(3);
    },
  );

  it("권한 오류는 거래를 다시 시도하지 않는다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "missing-user", role: "STUDENT" } });

    const response = await createRelay();

    expect(response.status).toBe(403);
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("주제와 언어값이 없거나 올바르지 않으면 실행을 만들지 않는다", async () => {
    const missingTopic = await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: CREATE_ID,
      locale: "ko",
    });
    const invalidLocale = await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: SECOND_CREATE_ID,
      topic: "우주",
      locale: "fr",
    });
    const longTopic = await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: THIRD_CREATE_ID,
      topic: "가".repeat(81),
      locale: "ko",
    });

    expect([missingTopic.status, invalidLocale.status, longTopic.status]).toEqual([400, 400, 400]);
    expect(runs).toHaveLength(0);
  });

  it("비속어가 든 주제는 저장하지 않는다", async () => {
    const response = await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: CREATE_ID,
      topic: "fuck 우주",
      locale: "ko",
    });

    expect(response.status).toBe(400);
    expect(runs).toHaveLength(0);
  });

  it("이어 말하기만 열고 목표 질문 수는 서버 규칙에서 정한다", async () => {
    const response = await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: CREATE_ID,
      topic: "우주",
      locale: "ko",
      targetCount: 1,
      validQuestions: 999_999,
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      run: { id: "run-1", mode: "SOLO", targetCount: 3, questionCount: 0, preview: false },
    });
    expect(runs.get("run-1")?.ownerId).toBe("student-1");
  });

  it("아직 준비되지 않은 놀이는 실행을 저장하지 않고 거절한다", async () => {
    const response = await postCreate({
      gameId: "hot-potato",
      mode: "solo",
      requestId: CREATE_ID,
      topic: "우주",
      locale: "ko",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ unsupported: true });
    expect(runs).toHaveLength(0);
  });

  it("같은 생성 요청은 같은 실행을 반환하고 다른 본문은 거절한다", async () => {
    const first = await createRelay();
    const replay = await createRelay();
    const conflict = await postCreate({
      gameId: "relay",
      mode: "ai",
      requestId: CREATE_ID,
      topic: "우주",
      locale: "ko",
    });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect((await replay.json()).run.id).toBe("run-1");
    expect(conflict.status).toBe(409);
    expect(runs).toHaveLength(1);
  });

  it("같은 생성 요청의 주제나 언어가 달라지면 기존 실행을 재사용하지 않는다", async () => {
    await createRelay();
    const topicConflict = await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: CREATE_ID,
      topic: "바다",
      locale: "ko",
    });
    const localeConflict = await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: CREATE_ID,
      topic: "우주",
      locale: "en",
    });

    expect(topicConflict.status).toBe(409);
    expect(localeConflict.status).toBe(409);
    expect(runs).toHaveLength(1);
  });

  it("동시에 네 실행을 만들면 가장 오래된 실행을 닫고 진행 중 실행 세 개를 유지한다", async () => {
    const responses = await Promise.all([
      postCreate({ gameId: "relay", mode: "solo", requestId: CREATE_ID, topic: "우주", locale: "ko" }),
      postCreate({ gameId: "relay", mode: "solo", requestId: SECOND_CREATE_ID, topic: "우주", locale: "ko" }),
      postCreate({ gameId: "relay", mode: "solo", requestId: THIRD_CREATE_ID, topic: "우주", locale: "ko" }),
      postCreate({ gameId: "relay", mode: "solo", requestId: FOURTH_CREATE_ID, topic: "우주", locale: "ko" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201]);
    expect([...runs.values()].filter((run) =>
      run.status === "ACTIVE" && run.expiresAt > new Date(),
    )).toHaveLength(3);
    expect(runs.get("run-1")?.status).toBe("ABANDONED");
    const userLocks = mocks.queryRaw.mock.calls
      .map(([strings]) => (strings as TemplateStringsArray).join("?"))
      .filter((sql) => sql.includes('FROM "users"'));
    expect(userLocks).toHaveLength(4);
    expect(userLocks.every((sql) => sql.includes("FOR UPDATE"))).toBe(true);
  });

  it("기한이 지난 실행은 진행 중 실행 세 개 상한에서 제외한다", async () => {
    await postCreate({ gameId: "relay", mode: "solo", requestId: CREATE_ID, topic: "우주", locale: "ko" });
    await postCreate({ gameId: "relay", mode: "solo", requestId: SECOND_CREATE_ID, topic: "우주", locale: "ko" });
    await postCreate({ gameId: "relay", mode: "solo", requestId: THIRD_CREATE_ID, topic: "우주", locale: "ko" });
    const firstRun = runs.get("run-1");
    if (!firstRun) throw new Error("missing run");
    firstRun.expiresAt = new Date(0);

    const replacement = await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: FOURTH_CREATE_ID,
      topic: "우주",
      locale: "ko",
    });
    const overLimit = await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: FIFTH_CREATE_ID,
      topic: "우주",
      locale: "ko",
    });

    expect(replacement.status).toBe(201);
    expect(overLimit.status).toBe(201);
    expect([...runs.values()].filter((run) =>
      run.status === "ACTIVE" && run.expiresAt > new Date(),
    )).toHaveLength(3);
  });

  it("지원하지 않는 놀이 요청은 기존 진행 실행을 닫지 않는다", async () => {
    await postCreate({ gameId: "relay", mode: "solo", requestId: CREATE_ID, topic: "우주", locale: "ko" });
    await postCreate({ gameId: "relay", mode: "solo", requestId: SECOND_CREATE_ID, topic: "바다", locale: "ko" });
    await postCreate({ gameId: "relay", mode: "solo", requestId: THIRD_CREATE_ID, topic: "날씨", locale: "ko" });

    const response = await postCreate({
      gameId: "hot-potato",
      mode: "solo",
      requestId: FOURTH_CREATE_ID,
      topic: "우주",
      locale: "ko",
    });

    expect(response.status).toBe(409);
    expect([...runs.values()].filter((run) => run.status === "ACTIVE")).toHaveLength(3);
    expect([...runs.values()].every((run) => run.status === "ACTIVE")).toBe(true);
  });

  it("질문 동작은 작성 순서를 서버가 기록하고 같은 요청 재전송을 한 번만 처리한다", async () => {
    await createRelay();
    const first = await submitQuestion(0);
    const replay = await submitQuestion(0);
    const conflict = await submitQuestion(0, "같은 요청으로 다른 질문인가요?");

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(conflict.status).toBe(409);
    expect(activities.filter((activity) => activity.type === "RELAY_QUESTION")).toHaveLength(1);
    expect(activities[0]).toMatchObject({ sequence: 1, validQuestionCount: 1 });
    expect(activities[0]?.payload).not.toHaveProperty("question");
    expect((runs.get("run-1")?.state as { questionCount: number }).questionCount).toBe(1);
  });

  it("이백 자보다 긴 질문은 활동으로 기록하지 않는다", async () => {
    await createRelay();

    const response = await submitQuestion(0, `${"a".repeat(200)}?`);

    expect(response.status).toBe(400);
    expect(activities).toHaveLength(0);
    expect((runs.get("run-1")?.state as { questionCount: number }).questionCount).toBe(0);
  });

  it("지원하지 않는 언어값은 질문 활동으로 기록하지 않는다", async () => {
    await createRelay();

    const response = await postAction({
      action: "relay-submit-question",
      requestId: ACTION_IDS[0],
      expectedVersion: 1,
      question: "왜 언어값을 확인해야 할까요?",
      locale: "fr",
    });

    expect(response.status).toBe(400);
    expect(activities).toHaveLength(0);
  });

  it("문장 부호만 있거나 의미 있는 글자가 한 글자인 입력은 질문 활동으로 기록하지 않는다", async () => {
    await createRelay();

    const punctuationOnly = await submitQuestion(0, "???");
    const oneMeaningfulCharacter = await submitQuestion(0, "별?");

    expect(punctuationOnly.status).toBe(400);
    expect(oneMeaningfulCharacter.status).toBe(400);
    expect(activities).toHaveLength(0);
    expect((runs.get("run-1")?.state as { questionCount: number }).questionCount).toBe(0);
  });

  it("한국어와 영어의 화면 질문 판정 규칙을 서버에서도 똑같이 적용한다", async () => {
    const koreanRun = await createRelay();
    expect(koreanRun.status).toBe(201);
    const korean = await submitQuestion(0, "별은 왜 빛나나요");

    await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: SECOND_CREATE_ID,
      topic: "Space",
      locale: "en",
    });
    const english = await postAction({
      action: "relay-submit-question",
      requestId: ACTION_IDS[0],
      expectedVersion: 1,
      question: "Why do stars shine",
      locale: "en",
    }, "run-2");

    expect(korean.status).toBe(200);
    expect(english.status).toBe(200);
  });

  it("비속어가 든 질문은 올바른 질문 꼴이어도 활동으로 기록하지 않는다", async () => {
    await createRelay();

    const response = await submitQuestion(0, "fuck은 왜 쓰면 안 될까요?");

    expect(response.status).toBe(400);
    expect(activities).toHaveLength(0);
  });

  it("인공지능 모드는 학생 질문 다음에 서버 증명 차례를 기다린다", async () => {
    await createRelay("ai");
    const first = await submitQuestion(0);
    const second = await submitQuestion(1);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    await expect(first.json()).resolves.toMatchObject({
      run: { awaitingAiTurn: true, aiTurnCount: 0 },
    });
  });

  it("인공지능 차례 발급은 실행의 주제와 직전 학생 질문이 모두 맞아야 한다", async () => {
    const question = "별은 왜 밤에 더 잘 보일까요?";
    await createRelay("ai");
    await submitQuestion(0, question);

    const wrongTopic = await postAiTurn({
      requestId: AI_TURN_IDS[0],
      expectedVersion: 2,
      topic: "바다",
      previousQuestion: question,
      locale: "ko",
    });
    const wrongQuestion = await requestAiTurn(0, 2, "바다는 왜 파랄까요?");

    expect(wrongTopic.status).toBe(409);
    expect(wrongQuestion.status).toBe(409);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("같은 실행 버전의 인공지능 질문 생성은 자료베이스 임대로 한 번만 호출한다", async () => {
    const question = "별은 왜 밤에 더 잘 보일까요?";
    await createRelay("ai");
    await submitQuestion(0, question);
    let finishGeneration = (_value: string) => {};
    mocks.generateText.mockImplementationOnce(() => new Promise<string>((resolve) => {
      finishGeneration = resolve;
    }));

    const firstPromise = requestAiTurn(0, 2, question);
    await vi.waitFor(() => expect(mocks.generateText).toHaveBeenCalledOnce());
    const second = await requestAiTurn(1, 2, question);
    finishGeneration("그렇다면 별빛은 어디에서 시작될까요?");
    const first = await firstPromise;

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(mocks.generateText).toHaveBeenCalledOnce();
    const state = runs.get("run-1")?.state as {
      aiGenerationLease?: { generationRequestId: string };
    };
    expect(state.aiGenerationLease?.generationRequestId).toBe(AI_TURN_IDS[0]);
    expect(JSON.stringify(state)).not.toContain(question);
  });

  it("발급 응답이 유실되어 같은 요청을 다시 보내면 암호화한 응답을 모델 호출 없이 재생한다", async () => {
    const question = "별은 왜 밤에 더 잘 보일까요?";
    await createRelay("ai");
    await submitQuestion(0, question);

    const first = await requestAiTurn(0, 2, question);
    const firstBody = await first.json() as { output: string; proof: string };
    const replay = await requestAiTurn(0, 2, question);
    const replayBody = await replay.json() as { output: string; proof: string };
    const serializedState = JSON.stringify(runs.get("run-1")?.state);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replayBody).toEqual(firstBody);
    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(serializedState).not.toContain(firstBody.output);
    expect(serializedState).not.toContain(firstBody.proof);

    const recorded = await recordAiTurn(0, 2, firstBody.output, firstBody.proof);
    expect(recorded.status).toBe(200);
    expect((runs.get("run-1")?.state as { aiGenerationLease?: unknown }).aiGenerationLease)
      .toBeUndefined();
  });

  it("위조된 인공지능 차례 증명은 활동으로 기록하지 않는다", async () => {
    const question = "별은 왜 밤에 더 잘 보일까요?";
    await createRelay("ai");
    await submitQuestion(0, question);
    const issued = await requestAiTurn(0, 2, question);
    const body = await issued.json() as { output: string; proof: string };
    const forgedProof = `${body.proof.slice(0, -1)}${body.proof.endsWith("a") ? "b" : "a"}`;

    const response = await recordAiTurn(0, 2, body.output, forgedProof);
    const errorBody = await response.json();

    expect(issued.status).toBe(200);
    expect(response.status).toBe(409);
    expect(errorBody).toEqual({
      error: "인공지능 차례 증명이 만료되었거나 올바르지 않습니다",
      aiProofRejected: true,
    });
    expect(activities.filter((activity) => activity.type === "RELAY_AI_TURN")).toHaveLength(0);
    expect((runs.get("run-1")?.state as { aiTurnCount: number }).aiTurnCount).toBe(0);
  });

  it("다른 생성 임대로 바뀐 뒤에는 이전에 발급한 증명을 기록하지 않는다", async () => {
    const question = "별은 왜 밤에 더 잘 보일까요?";
    await createRelay("ai");
    await submitQuestion(0, question);
    const issued = await requestAiTurn(0, 2, question);
    const body = await issued.json() as { output: string; proof: string };
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    const state = run.state as Record<string, unknown>;
    run.state = {
      ...state,
      aiGenerationLease: {
        ...(state.aiGenerationLease as Record<string, unknown>),
        id: "00000000-0000-4000-8000-000000000052",
      },
    };

    const response = await recordAiTurn(0, 2, body.output, body.proof);

    expect(response.status).toBe(409);
    expect(activities.filter((activity) => activity.type === "RELAY_AI_TURN")).toHaveLength(0);
  });

  it("발급 요청 식별값이 없거나 증명과 다르면 인공지능 차례를 기록하지 않는다", async () => {
    const question = "별은 왜 밤에 더 잘 보일까요?";
    await createRelay("ai");
    await submitQuestion(0, question);
    const issued = await requestAiTurn(0, 2, question);
    const body = await issued.json() as { output: string; proof: string };

    const missing = await postAction({
      action: "relay-record-ai-turn",
      requestId: AI_RECORD_IDS[1],
      expectedVersion: 2,
      output: body.output,
      proof: body.proof,
    });
    const different = await postAction({
      action: "relay-record-ai-turn",
      requestId: AI_RECORD_IDS[0],
      generationRequestId: AI_TURN_IDS[1],
      expectedVersion: 2,
      output: body.output,
      proof: body.proof,
    });

    expect(missing.status).toBe(400);
    expect(different.status).toBe(409);
    expect(activities.filter((activity) => activity.type === "RELAY_AI_TURN")).toHaveLength(0);
  });

  it("만료된 인공지능 차례 증명은 활동으로 기록하지 않는다", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-16T03:00:00.000Z"));
      const question = "별은 왜 밤에 더 잘 보일까요?";
      await createRelay("ai");
      await submitQuestion(0, question);
      const issued = await requestAiTurn(0, 2, question);
      const body = await issued.json() as { output: string; proof: string };
      vi.setSystemTime(new Date("2026-07-16T03:05:00.000Z"));

      const response = await recordAiTurn(0, 2, body.output, body.proof);

      expect(response.status).toBe(409);
      expect(activities.filter((activity) => activity.type === "RELAY_AI_TURN")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("모델 호출 실패는 내부 내용을 숨기고 같은 인공지능 차례를 다시 열어 둔다", async () => {
    const question = "별은 왜 밤에 더 잘 보일까요?";
    await createRelay("ai");
    await submitQuestion(0, question);
    mocks.generateText
      .mockRejectedValueOnce(new Error("private-api-key-value"))
      .mockResolvedValueOnce("그렇다면 별빛은 어디에서 시작될까요?");

    const response = await requestAiTurn(0, 2, question);
    const body = await response.json() as { error: string };
    const retry = await requestAiTurn(0, 2, question);
    const result = await readResult();

    expect(response.status).toBe(502);
    expect(retry.status).toBe(200);
    expect(body.error).not.toContain("private-api-key-value");
    await expect(result.json()).resolves.toMatchObject({
      run: { awaitingAiTurn: true, aiTurnCount: 0, version: 2 },
    });
    expect(activities.filter((activity) => activity.type === "RELAY_AI_TURN")).toHaveLength(0);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it("만료된 실행 결과를 조회하면 상태와 버전을 만료값으로 확정한다", async () => {
    await createRelay();
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    run.expiresAt = new Date(0);

    const response = await readResult();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: { status: "EXPIRED", version: 2 },
      result: null,
    });
    expect(run.status).toBe("EXPIRED");
    expect(run.version).toBe(2);
  });

  it("인공지능 생성 임대가 남은 실행도 만료 조회 때 임대를 지우고 닫는다", async () => {
    await createRelay("ai");
    await submitQuestion(0, "별은 왜 밤에 더 잘 보일까요?");
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    run.state = {
      ...(run.state as Record<string, unknown>),
      aiGenerationLease: {
        id: "00000000-0000-4000-8000-000000000051",
        generationRequestId: AI_TURN_IDS[0],
        runVersion: 2,
        expiresAt: Date.now() + 60_000,
      },
    };
    run.expiresAt = new Date(0);

    const response = await readResult();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: { status: "EXPIRED", version: 3 },
    });
    expect((run.state as { aiGenerationLease?: unknown }).aiGenerationLease).toBeUndefined();
  });

  it("같은 생성 요청을 만료 뒤 다시 보내면 새 실행 대신 만료된 원래 실행을 돌려준다", async () => {
    await createRelay();
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    run.expiresAt = new Date(0);

    const replay = await createRelay();

    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      run: { id: "run-1", status: "EXPIRED", version: 2 },
    });
    expect(runs).toHaveLength(1);
  });

  it("임대가 남은 실행을 활성 상한으로 포기한 뒤에도 같은 생성 요청으로 상태를 읽는다", async () => {
    await createRelay("ai");
    await submitQuestion(0, "별은 왜 밤에 더 잘 보일까요?");
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    run.state = {
      ...(run.state as Record<string, unknown>),
      aiGenerationLease: {
        id: "00000000-0000-4000-8000-000000000051",
        generationRequestId: AI_TURN_IDS[0],
        runVersion: 2,
        expiresAt: Date.now() + 60_000,
      },
    };
    await postCreate({
      gameId: "relay", mode: "solo", requestId: SECOND_CREATE_ID, topic: "바다", locale: "ko",
    });
    await postCreate({
      gameId: "relay", mode: "solo", requestId: THIRD_CREATE_ID, topic: "날씨", locale: "ko",
    });
    await postCreate({
      gameId: "relay", mode: "solo", requestId: FOURTH_CREATE_ID, topic: "공룡", locale: "ko",
    });

    const replay = await createRelay("ai");

    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      run: { id: "run-1", status: "ABANDONED", version: 3 },
    });
    expect((run.state as { aiGenerationLease?: unknown }).aiGenerationLease).toBeUndefined();
  });

  it("서버 증명 인공지능 차례 두 번과 학생 질문 세 개를 순서대로 기록하면 구 점을 지급한다", async () => {
    await createRelay("ai");
    const played = await playVerifiedAiRelay();
    const response = played.responses.at(-1);
    if (!response) throw new Error("missing final response");
    const recovery = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 6 });
    const persisted = JSON.stringify({ state: runs.get("run-1")?.state, activities });

    expect(played.responses.map((item) => item.status)).toEqual([200, 200, 200, 200, 200, 200, 200]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 6, questionCount: 3, aiTurnCount: 2, awaitingAiTurn: false },
      result: { awarded: 9, dailyLimit: 50 },
    });
    expect(recovery.status).toBe(200);
    await expect(recovery.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 6 },
      result: { awarded: 9, alreadySettled: true },
    });
    expect(activities.map((activity) => activity.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(activities.map((activity) => activity.type)).toEqual([
      "RELAY_QUESTION",
      "RELAY_AI_TURN",
      "RELAY_QUESTION",
      "RELAY_AI_TURN",
      "RELAY_QUESTION",
    ]);
    for (const rawText of ["우주", ...played.questions, ...played.outputs]) {
      expect(persisted).not.toContain(rawText);
    }
    expect(users.get("student-1")?.totalPoints).toBe(9);
  });

  it("상태 수만 조작하고 서버 증명 활동이 없으면 인공지능 모드를 완료하지 않는다", async () => {
    await createRelay("ai");
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    const state = run.state as Record<string, unknown>;
    run.state = {
      ...state,
      questionCount: 3,
      aiTurnCount: 2,
      activitySequence: 5,
      nextActor: "COMPLETE",
      questionHashes: ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
    };
    run.version = 6;
    for (let index = 0; index < 3; index += 1) {
      activities.push({
        id: `forged-question-${index}`,
        runId: run.id,
        actorId: "student-1",
        requestId: ACTION_IDS[index],
        requestFingerprint: "forged",
        sequence: index * 2 + 1,
        type: "RELAY_QUESTION",
        payload: {},
        validQuestionCount: 1,
        scoreValue: 0,
        responseSnapshot: {},
        createdAt: new Date(),
      });
    }

    const response = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 6 });

    expect(response.status).toBe(409);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it("다른 학생은 실행 존재 여부를 알아도 동작과 결과를 읽을 수 없다", async () => {
    await createRelay();
    mocks.auth.mockResolvedValue({ user: { id: "student-2", role: "STUDENT" } });

    expect((await submitQuestion(0)).status).toBe(403);
    expect((await readResult()).status).toBe(403);
    expect(activities).toHaveLength(0);
  });

  it("화면이 완료값과 큰 활동 수를 보내도 질문 세 개 전에는 완료하지 않는다", async () => {
    await createRelay();
    await submitQuestion(0);

    const response = await postComplete({
      requestId: COMPLETE_ID,
      expectedVersion: 2,
      completed: true,
      validQuestions: 999_999,
    });

    expect(response.status).toBe(409);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it("마지막 학생 질문을 저장하는 거래에서 실행과 포인트를 함께 정산한다", async () => {
    await createRelay();
    await submitQuestion(0);
    await submitQuestion(1);

    const response = await submitQuestion(2);
    const result = await readResult();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 4, questionCount: 3 },
      result: { awarded: 5, dailyLimit: 30, cappedByLimit: false },
      replayed: false,
    });
    await expect(result.json()).resolves.toMatchObject({
      run: { status: "SETTLED", questionCount: 3 },
      result: { awarded: 5, dailyLimit: 30, alreadySettled: true },
    });
    expect(pointLogs).toHaveLength(1);
    expect(pointLogs[0]).toMatchObject({
      gameId: "ACTIVITY_SOLO",
      bonusType: "ACTIVITY_SOLO_relay",
      gameRunId: "run-1",
      points: 5,
    });
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("마지막 질문 응답이 유실되어 같은 요청을 다시 보내도 저장 결과를 재생하고 한 번만 지급한다", async () => {
    await createRelay();
    await submitQuestion(0);
    await submitQuestion(1);

    const lostResponse = await submitQuestion(2);
    const replay = await submitQuestion(2);
    const lostBody = await lostResponse.json();
    const replayBody = await replay.json();

    expect(lostResponse.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replayBody).toMatchObject({
      run: { status: "SETTLED", version: 4 },
      result: { awarded: 5 },
      replayed: true,
    });
    expect(replayBody).toMatchObject({ run: lostBody.run, result: lostBody.result });
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("서로 다른 마지막 질문 요청이 동시에 오면 하나만 정산한다", async () => {
    await createRelay();
    await submitQuestion(0);
    await submitQuestion(1);

    const responses = await Promise.all([
      submitQuestion(2, "마지막 질문은 왜 중요할까요?"),
      postAction({
        action: "relay-submit-question",
        requestId: ALTERNATE_FINAL_ACTION_ID,
        expectedVersion: 3,
        question: "다른 마지막 질문은 왜 필요할까요?",
        locale: "ko",
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(5);
    expect(runs.get("run-1")).toMatchObject({ status: "SETTLED", version: 4 });
  });

  it("자동 정산 뒤 완료 요청을 보내도 기존 결과만 돌려주고 다시 지급하지 않는다", async () => {
    await createRelay();
    await submitQuestion(0);
    await submitQuestion(1);
    await submitQuestion(2);

    const first = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 4 });
    const replay = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 4 });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 4 },
      result: { awarded: 5, alreadySettled: true },
    });
    await expect(replay.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 4 },
      result: { awarded: 5, alreadySettled: true },
    });
    expect(activities.filter((activity) => activity.type === "RUN_COMPLETE")).toHaveLength(0);
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("이전 방식으로 완료 상태에 머문 실행도 완료 요청으로 한 번만 정산한다", async () => {
    await createRelay();
    await submitQuestion(0);
    await submitQuestion(1);
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    const state = run.state as Record<string, unknown>;
    run.state = {
      ...state,
      questionCount: 3,
      activitySequence: 3,
      nextActor: "COMPLETE",
      questionHashes: [
        ...(state.questionHashes as string[]),
        "c".repeat(64),
      ],
    };
    run.version = 4;
    activities.push({
      id: "legacy-final-question",
      runId: run.id,
      actorId: "student-1",
      requestId: ACTION_IDS[2],
      requestFingerprint: "legacy",
      sequence: 3,
      type: "RELAY_QUESTION",
      payload: {},
      validQuestionCount: 1,
      scoreValue: 0,
      responseSnapshot: {},
      createdAt: new Date(),
    });

    const response = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 4 });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 5 },
      result: { awarded: 5 },
    });
    expect(activities.filter((activity) => activity.type === "RUN_COMPLETE")).toHaveLength(1);
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("저장된 실행 모드가 알 수 없는 값이면 도움 모드 점수로 처리하지 않는다", async () => {
    await createRelay();
    await submitQuestion(0);
    await submitQuestion(1);
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    run.mode = "BROKEN";

    const response = await submitQuestion(2);

    expect(response.status).toBe(409);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it.each([
    { awarded: "5", dailyLimit: 30, dailyRemaining: 25, cappedByLimit: false, preview: false },
    { awarded: 5, dailyLimit: 30, dailyRemaining: 31, cappedByLimit: false, preview: false },
    { awarded: 5, dailyLimit: 30, dailyRemaining: 25, cappedByLimit: "no", preview: false },
  ])("손상된 점수 결과 %j를 화면에 공개하지 않는다", async (result) => {
    await createRelay();
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    run.state = { ...(run.state as Record<string, unknown>), result };

    const response = await readResult();

    expect(response.status).toBe(409);
  });

  it("잠금 뒤 자료베이스 시각 하나로 날짜와 점수 기록 시각을 확정한다", async () => {
    await createRelay();
    await submitQuestion(0);
    await submitQuestion(1);
    databaseClock = new Date("2026-07-16T15:00:01.500Z");
    pointLogs.push({
      studentId: "student-1",
      gameId: "ACTIVITY_SOLO",
      gameRunId: "old-run",
      bonusType: "ACTIVITY_SOLO_relay",
      points: 29,
      reason: "같은 서울 날짜의 이전 실행",
      status: "APPROVED",
      createdAt: new Date("2026-07-16T15:00:00.100Z"),
    });
    const sqlCallStart = mocks.queryRaw.mock.calls.length;

    const response = await submitQuestion(2);
    const run = runs.get("run-1");
    const awardedLog = pointLogs.at(-1);
    const sqlCalls = mocks.queryRaw.mock.calls.slice(sqlCallStart)
      .map(([strings]) => (strings as TemplateStringsArray).join("?"));
    const userLockIndex = sqlCalls.findIndex((sql) =>
      sql.includes('FROM "users"') && sql.includes("FOR UPDATE"));
    const runLockIndex = sqlCalls.findIndex((sql) => sql.includes('FROM "game_runs"'));
    const clockIndex = sqlCalls.findIndex((sql) => sql.includes("clock_timestamp()"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ result: { awarded: 1 } });
    expect(awardedLog?.createdAt).toEqual(databaseClock);
    expect(run).toMatchObject({
      scoreDate: "2026-07-17",
      completedAt: databaseClock,
      settledAt: databaseClock,
    });
    expect(clockIndex).toBeGreaterThan(userLockIndex);
    expect(clockIndex).toBeGreaterThan(runLockIndex);
  });

  it("마지막 활동 기록이 실패하면 질문과 포인트 정산을 모두 되돌리고 재시도할 수 있다", async () => {
    await createRelay();
    await submitQuestion(0);
    await submitQuestion(1);
    mocks.activityCreate.mockRejectedValueOnce(new Error("private-activity-storage-value"));

    const failed = await submitQuestion(2);
    const failedBody = await failed.json() as { error: string };

    expect(failed.status).toBe(500);
    expect(failedBody.error).toBe("질문놀이 실행을 처리할 수 없습니다");
    expect(JSON.stringify(failedBody)).not.toContain("private-activity-storage-value");
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 3 });
    expect(runs.get("run-1")?.state).toMatchObject({
      questionCount: 2,
      activitySequence: 2,
      nextActor: "STUDENT",
    });
    expect(activities.filter((activity) => activity.runId === "run-1")).toHaveLength(2);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);

    const retry = await submitQuestion(2);

    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 4 },
      result: { awarded: 5 },
    });
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("도움 모드는 하루 오십 점 안에서만 지급한다", async () => {
    pointLogs.push({
      studentId: "student-1",
      gameId: "ACTIVITY_AI",
      gameRunId: "old-run",
      bonusType: "ACTIVITY_AI_relay",
      points: 47,
      reason: "이전 실행",
      status: "APPROVED",
      createdAt: new Date(),
    });
    await createRelay("ai");
    const played = await playVerifiedAiRelay();
    const response = played.responses.at(-1);
    if (!response) throw new Error("missing final response");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { awarded: 3, dailyLimit: 50, cappedByLimit: true },
    });
    expect(users.get("student-1")?.totalPoints).toBe(3);
  });

  it("서로 다른 두 실행을 동시에 완료해도 혼자 모드 일일 상한을 넘지 않는다", async () => {
    pointLogs.push({
      studentId: "student-1",
      gameId: "ACTIVITY_SOLO",
      gameRunId: "old-run",
      bonusType: "ACTIVITY_SOLO_relay",
      points: 25,
      reason: "이전 실행",
      status: "APPROVED",
      createdAt: new Date(),
    });
    await createRelay();
    await submitQuestion(0);
    await submitQuestion(1);
    await postCreate({
      gameId: "relay",
      mode: "solo",
      requestId: SECOND_CREATE_ID,
      topic: "우주",
      locale: "ko",
    });
    await submitQuestion(0, "두 번째 실행의 첫 질문인가요?", "run-2");
    await submitQuestion(1, "두 번째 실행의 다음 질문인가요?", "run-2");

    const responses = await Promise.all([
      submitQuestion(2, "첫 번째 실행의 마지막 질문인가요?", "run-1"),
      submitQuestion(2, "두 번째 실행의 마지막 질문인가요?", "run-2"),
    ]);
    const results = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(results.map((result) => result.result.awarded).sort((a, b) => a - b)).toEqual([0, 5]);
    expect(pointLogs
      .filter((log) => log.gameId === "ACTIVITY_SOLO")
      .reduce((sum, log) => sum + log.points, 0)).toBe(30);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("교사 미리보기 실행은 완료해도 점수 기록과 합계를 만들지 않는다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    await createRelay();
    await submitQuestion(0);
    await submitQuestion(1);

    const response = await submitQuestion(2);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: { preview: true },
      result: { awarded: 0, preview: true },
    });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("teacher-1")?.totalPoints).toBe(0);
  });
});

describe("질문 주사위 서버 실행 경로", () => {
  it("서버가 주사위 얼굴을 정하고 같은 굴리기 요청에는 같은 얼굴을 돌려준다", async () => {
    const created = await createDice();
    const first = await rollDice(0, 1);
    const firstBody = await first.json() as {
      run: { nextStep: string; pendingRoll: { actor: string; face: number } };
    };
    const replay = await rollDice(0, 1);
    const replayBody = await replay.json() as typeof firstBody;

    expect(created.status).toBe(201);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(firstBody.run).toMatchObject({
      nextStep: "STUDENT_QUESTION",
      pendingRoll: { actor: "STUDENT" },
    });
    expect(firstBody.run.pendingRoll.face).toBeGreaterThanOrEqual(1);
    expect(firstBody.run.pendingRoll.face).toBeLessThanOrEqual(6);
    expect(replayBody.run.pendingRoll.face).toBe(firstBody.run.pendingRoll.face);
    expect(activities.filter((activity) => activity.type === "DICE_ROLL")).toHaveLength(1);
  });

  it("혼자 모드에서 굴리기와 질문 세 번을 확인하고 같은 거래에서 오 점을 지급한다", async () => {
    const created = await createDice();
    const createdBody = await created.json() as { run: Record<string, unknown> };
    expect(created.status).toBe(201);
    expect(createdBody.run).toMatchObject({
      gameId: "dice",
      status: "ACTIVE",
      version: 1,
      questionCount: 0,
      nextStep: "STUDENT_ROLL",
      pendingRoll: null,
    });

    let version = 1;
    let finalBody: Record<string, unknown> | undefined;
    for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
      const rolled = await rollDice(questionIndex * 2, version);
      expect(rolled.status).toBe(200);
      version += 1;
      const submitted = await submitDiceQuestion(questionIndex * 2 + 1, version);
      expect(submitted.status).toBe(200);
      version += 1;
      finalBody = await submitted.json() as Record<string, unknown>;
    }

    expect(finalBody).toMatchObject({
      run: { status: "SETTLED", version: 7, questionCount: 3, nextStep: "COMPLETE" },
      result: { awarded: 5, preview: false },
    });
    expect(activities.map((activity) => activity.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(activities.map((activity) => activity.type)).toEqual([
      "DICE_ROLL",
      "DICE_QUESTION",
      "DICE_ROLL",
      "DICE_QUESTION",
      "DICE_ROLL",
      "DICE_QUESTION",
    ]);
    expect(pointLogs).toHaveLength(1);
    expect(pointLogs[0]).toMatchObject({
      gameId: "ACTIVITY_SOLO",
      bonusType: "ACTIVITY_SOLO_dice",
      points: 5,
    });
    expect(users.get("student-1")?.totalPoints).toBe(5);

    const finalReplay = await submitDiceQuestion(5, 6);
    expect(finalReplay.status).toBe(200);
    await expect(finalReplay.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 7 },
      result: { awarded: 5 },
      replayed: true,
    });
    expect(pointLogs).toHaveLength(1);

    const recovered = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 7 });
    expect(recovered.status).toBe(200);
    await expect(recovered.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 7 },
      result: { awarded: 5, alreadySettled: true },
    });
    expect(pointLogs).toHaveLength(1);
  });

  it("도움 모드에서 학생 질문 셋과 얼굴에 묶인 인공지능 질문 둘을 확인해 구 점을 지급한다", async () => {
    const aiOutputs = [
      "이 유형으로 첫 질문을 어떻게 만들 수 있을까요?",
      "같은 유형의 다른 질문은 무엇일까요?",
    ];
    mocks.generateText
      .mockResolvedValueOnce(aiOutputs[0])
      .mockResolvedValueOnce(aiOutputs[1]);
    expect((await createDice("ai")).status).toBe(201);

    let version = 1;
    for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
      expect((await rollDice(questionIndex * 4, version)).status).toBe(200);
      version += 1;
      const student = await submitDiceQuestion(questionIndex * 4 + 1, version);
      expect(student.status).toBe(200);
      version += 1;
      if (questionIndex === 2) {
        await expect(student.json()).resolves.toMatchObject({
          run: { status: "SETTLED", version: 11, nextStep: "COMPLETE" },
          result: { awarded: 9 },
        });
        break;
      }

      expect((await rollDice(questionIndex * 4 + 2, version)).status).toBe(200);
      version += 1;
      const issued = await requestDiceAiQuestion(questionIndex, version);
      expect(issued.status).toBe(200);
      const issuedBody = await issued.json() as { output: string; proof: string };
      const recorded = await recordDiceAiQuestion(
        questionIndex,
        version,
        issuedBody.output,
        issuedBody.proof,
      );
      expect(recorded.status).toBe(200);
      version += 1;
    }

    expect(activities.filter((activity) => activity.type === "DICE_ROLL")).toHaveLength(5);
    expect(activities.filter((activity) => activity.type === "DICE_QUESTION")).toHaveLength(3);
    expect(activities.filter((activity) => activity.type === "DICE_AI_QUESTION")).toHaveLength(2);
    expect(pointLogs).toHaveLength(1);
    expect(pointLogs[0]).toMatchObject({ gameId: "ACTIVITY_AI", points: 9 });
    expect(users.get("student-1")?.totalPoints).toBe(9);
    const stored = JSON.stringify({ runs: [...runs.values()], activities, pointLogs });
    for (const rawText of [
      ...aiOutputs,
      "주사위 질문 2은 왜 필요할까요?",
      "주사위 질문 6은 왜 필요할까요?",
      "주사위 질문 10은 왜 필요할까요?",
    ]) {
      expect(stored).not.toContain(rawText);
    }
  });

  it("인공지능 질문 증명을 발급한 뒤 주사위 얼굴이 달라지면 기록하지 않는다", async () => {
    await createDice("ai");
    await rollDice(0, 1);
    await submitDiceQuestion(1, 2);
    await rollDice(2, 3);
    const issued = await requestDiceAiQuestion(0, 4);
    const issuedBody = await issued.json() as { output: string; proof: string };
    const state = runs.get("run-1")?.state as {
      pendingRoll: { actor: "AI"; face: number };
    };
    state.pendingRoll.face = state.pendingRoll.face === 6 ? 5 : state.pendingRoll.face + 1;

    const response = await recordDiceAiQuestion(0, 4, issuedBody.output, issuedBody.proof);

    expect(response.status).toBe(409);
    expect(activities.filter((activity) => activity.type === "DICE_AI_QUESTION")).toHaveLength(0);
    expect(pointLogs).toHaveLength(0);
  });

  it("마지막 질문에서 저장된 굴리기 증거 순서가 빠졌으면 정산을 거부한다", async () => {
    await createDice();
    await rollDice(0, 1);
    await submitDiceQuestion(1, 2);
    await rollDice(2, 3);
    await submitDiceQuestion(3, 4);
    await rollDice(4, 5);
    activities.splice(0, 1);

    const response = await submitDiceQuestion(5, 6);

    expect(response.status).toBe(409);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 6 });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it("서로 다른 마지막 질문 요청이 동시에 오면 한 건만 정산한다", async () => {
    await createDice();
    await rollDice(0, 1);
    await submitDiceQuestion(1, 2);
    await rollDice(2, 3);
    await submitDiceQuestion(3, 4);
    await rollDice(4, 5);

    const responses = await Promise.all([
      submitDiceQuestion(5, 6, "마지막 주사위 질문은 무엇일까요?"),
      postAction({
        action: "dice-submit-question",
        requestId: ALTERNATE_FINAL_ACTION_ID,
        expectedVersion: 6,
        question: "동시에 보낸 다른 마지막 질문은 무엇일까요?",
        locale: "ko",
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(pointLogs).toHaveLength(1);
    expect(pointLogs[0]?.points).toBe(5);
    expect(users.get("student-1")?.totalPoints).toBe(5);
    expect(activities.filter((activity) => activity.type === "DICE_QUESTION")).toHaveLength(3);
  });

  it("교사 미리보기 질문 주사위는 완료해도 점수를 지급하지 않는다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    await createDice();
    let version = 1;
    let finalResponse: Response | undefined;
    for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
      await rollDice(questionIndex * 2, version);
      version += 1;
      finalResponse = await submitDiceQuestion(questionIndex * 2 + 1, version);
      version += 1;
    }

    if (!finalResponse) throw new Error("missing final response");
    expect(finalResponse.status).toBe(200);
    await expect(finalResponse.json()).resolves.toMatchObject({
      run: { preview: true, status: "SETTLED" },
      result: { awarded: 0, preview: true },
    });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("teacher-1")?.totalPoints).toBe(0);
  });

  it("혼자 모드 일일 상한에 이 점만 남으면 이 점만 지급한다", async () => {
    pointLogs.push({
      studentId: "student-1",
      gameId: "ACTIVITY_SOLO",
      gameRunId: "old-run",
      bonusType: "ACTIVITY_SOLO_dice",
      points: 28,
      reason: "이전 실행",
      status: "APPROVED",
      createdAt: new Date(),
    });
    await createDice();
    let version = 1;
    let finalResponse: Response | undefined;
    for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
      await rollDice(questionIndex * 2, version);
      version += 1;
      finalResponse = await submitDiceQuestion(questionIndex * 2 + 1, version);
      version += 1;
    }

    if (!finalResponse) throw new Error("missing final response");
    expect(finalResponse.status).toBe(200);
    await expect(finalResponse.json()).resolves.toMatchObject({
      result: { awarded: 2, dailyRemaining: 0, cappedByLimit: true },
    });
    expect(users.get("student-1")?.totalPoints).toBe(2);
    expect(pointLogs.filter((log) => log.gameRunId === "run-1")).toHaveLength(1);
    expect(pointLogs.find((log) => log.gameRunId === "run-1")?.points).toBe(2);
  });

  it("혼자 모드 일일 상한을 채운 학생의 완료 판도 영 점 표식으로 남긴다", async () => {
    pointLogs.push({
      studentId: "student-1",
      gameId: "ACTIVITY_SOLO",
      gameRunId: "old-run",
      bonusType: "ACTIVITY_SOLO_dice",
      points: 30,
      reason: "이전 실행",
      status: "APPROVED",
      createdAt: new Date(),
    });
    await createDice();
    let version = 1;
    let finalResponse: Response | undefined;
    for (let questionIndex = 0; questionIndex < 3; questionIndex += 1) {
      await rollDice(questionIndex * 2, version);
      version += 1;
      finalResponse = await submitDiceQuestion(questionIndex * 2 + 1, version);
      version += 1;
    }

    if (!finalResponse) throw new Error("missing final response");
    expect(finalResponse.status).toBe(200);
    await expect(finalResponse.json()).resolves.toMatchObject({
      result: { awarded: 0, dailyRemaining: 0, cappedByLimit: true },
    });
    expect(users.get("student-1")?.totalPoints).toBe(0);
    expect(pointLogs.filter((log) => log.gameRunId === "run-1")).toHaveLength(1);
    expect(pointLogs.find((log) => log.gameRunId === "run-1")).toMatchObject({
      studentId: "student-1",
      gameId: "ACTIVITY_SOLO",
      bonusType: "ACTIVITY_SOLO_dice",
      points: 0,
      status: "APPROVED",
    });
  });
});

describe("질문 사다리 서버 실행 경로", () => {
  it("만료된 실행을 한 단계 오른 버전으로 닫고 결과를 읽는다", async () => {
    await createLadder();
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    run.expiresAt = new Date(0);

    const response = await readResult();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: { status: "EXPIRED", version: 2, questionCount: 0 },
      result: null,
    });
  });

  it("활성 상한으로 자동 포기된 실행을 같은 생성 요청으로 다시 읽는다", async () => {
    await createLadder();
    for (const [requestId, topic] of [
      [SECOND_CREATE_ID, "바다"],
      [THIRD_CREATE_ID, "날씨"],
      [FOURTH_CREATE_ID, "공룡"],
    ] as const) {
      await postCreate({
        gameId: "ladder",
        mode: "solo",
        requestId,
        topics: [topic, `${topic} 둘`, `${topic} 셋`, `${topic} 넷`],
        locale: "ko",
      });
    }

    const replay = await createLadder();

    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      run: { id: "run-1", status: "ABANDONED", version: 2, questionCount: 0 },
    });
  });

  it("혼자 모드 주제 네 개를 해시로만 저장하고 첫째 서버 사다리를 공개한다", async () => {
    const response = await createLadder();
    const body = await response.json() as {
      run: { ladderRound: number; ladderGrid: boolean[][] };
    };
    const state = runs.get("run-1")?.state as {
      topicHashes: string[];
      grids: boolean[][][];
    };

    expect(response.status).toBe(201);
    expect(body.run).toMatchObject({ ladderRound: 1 });
    expect(body.run.ladderGrid).toHaveLength(10);
    expect(body.run.ladderGrid.every((row) => row.length === 3)).toBe(true);
    expect(state.topicHashes).toHaveLength(4);
    expect(state.grids).toHaveLength(3);
    expect(JSON.stringify(runs.get("run-1")?.state)).not.toContain("우주");
    expect(JSON.stringify(runs.get("run-1")?.state)).not.toContain("바다");
  });

  it.each([
    ["solo", ["하나", "둘"], "질문 사다리 주제를 4개 입력해 주세요"],
    ["ai", ["하나", "둘", "셋", "넷"], "질문 사다리 주제를 2개 입력해 주세요"],
    ["solo", ["하나", "둘", "셋", "fuck"], "주제에 사용할 수 없는 표현이 있습니다"],
  ] as const)("%s 모드의 잘못된 주제 배열을 거부한다", async (mode, topics, error) => {
    const response = await createLadder(mode, [...topics]);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(runs).toHaveLength(0);
  });

  it("세 질문을 현재 사다리 도착 주제에 묶어 기록하고 마지막 질문에서 오 점을 정산한다", async () => {
    const created = await createLadder();
    expect(created.status).toBe(201);
    const state = runs.get("run-1")?.state as {
      grids: boolean[][][];
      topicHashes: string[];
    };
    const expectedEvidence = state.grids.map((grid) => {
      const path = traceLadderColumns(0, grid);
      const destinationColumn = path.at(-1);
      if (destinationColumn === undefined) throw new Error("missing ladder destination");
      return { destinationColumn, topicHash: state.topicHashes[destinationColumn] };
    });

    const first = await submitLadderQuestion(0);
    const second = await submitLadderQuestion(1);
    const final = await submitLadderQuestion(2);

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      run: { status: "ACTIVE", version: 2, questionCount: 1, ladderRound: 2 },
    });
    await expect(second.json()).resolves.toMatchObject({
      run: { status: "ACTIVE", version: 3, questionCount: 2, ladderRound: 3 },
    });
    expect(final.status).toBe(200);
    await expect(final.json()).resolves.toMatchObject({
      run: {
        status: "SETTLED",
        version: 4,
        questionCount: 3,
        ladderRound: null,
        ladderGrid: null,
      },
      result: { awarded: 5, preview: false },
    });
    expect(activities.map(({ sequence, type }) => ({ sequence, type }))).toEqual([
      { sequence: 1, type: "LADDER_QUESTION" },
      { sequence: 2, type: "LADDER_QUESTION" },
      { sequence: 3, type: "LADDER_QUESTION" },
    ]);
    expect(activities.map((activity) => activity.payload)).toEqual([
      expect.objectContaining({ round: 1, startColumn: 0, ...expectedEvidence[0] }),
      expect.objectContaining({ round: 2, startColumn: 0, ...expectedEvidence[1] }),
      expect.objectContaining({ round: 3, startColumn: 0, ...expectedEvidence[2] }),
    ]);
    const stored = JSON.stringify({ run: runs.get("run-1"), activities });
    for (const question of [
      "사다리 질문 1은 왜 필요할까요?",
      "사다리 질문 2은 왜 필요할까요?",
      "사다리 질문 3은 왜 필요할까요?",
    ]) expect(stored).not.toContain(question);
    expect(pointLogs).toHaveLength(1);
    expect(pointLogs[0]).toMatchObject({
      gameId: "ACTIVITY_SOLO",
      bonusType: "ACTIVITY_SOLO_ladder",
      points: 5,
    });
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("인공지능 모드는 주제 두 개와 학생 질문 셋을 확인해 구 점을 정산한다", async () => {
    expect((await createLadder("ai")).status).toBe(201);
    expect((await submitLadderQuestion(0)).status).toBe(200);
    expect((await submitLadderQuestion(1)).status).toBe(200);
    const final = await submitLadderQuestion(2);

    expect(final.status).toBe(200);
    await expect(final.json()).resolves.toMatchObject({
      run: { status: "SETTLED", aiTurnCount: 0 },
      result: { awarded: 9, dailyLimit: 50 },
    });
    expect(pointLogs[0]).toMatchObject({ gameId: "ACTIVITY_AI", points: 9 });
    expect(users.get("student-1")?.totalPoints).toBe(9);
  });

  it("마지막 질문과 완료 및 결과 조회를 다시 보내도 한 번 정산한 결과를 복구한다", async () => {
    await createLadder();
    await submitLadderQuestion(0);
    await submitLadderQuestion(1);
    const final = await submitLadderQuestion(2);
    const replay = await submitLadderQuestion(2);
    const result = await readResult();
    const complete = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 4 });
    const completeBody = await complete.json();

    expect(final.status).toBe(200);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      run: { status: "SETTLED", version: 4 },
      result: { awarded: 5 },
    });
    await expect(result.json()).resolves.toMatchObject({
      run: { status: "SETTLED", ladderRound: null, ladderGrid: null },
      result: { awarded: 5, alreadySettled: true },
    });
    expect(complete.status).toBe(200);
    expect(completeBody).toMatchObject({
      replayed: true,
      result: { awarded: 5, alreadySettled: true },
    });
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("마지막 질문 전에 저장된 사다리 근거가 빠지면 정산을 거부한다", async () => {
    await createLadder();
    await submitLadderQuestion(0);
    await submitLadderQuestion(1);
    activities.splice(0, 1);

    const response = await submitLadderQuestion(2);

    expect(response.status).toBe(409);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 3 });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it("저장된 도착 열 근거가 서버 사다리와 다르면 정산을 거부한다", async () => {
    await createLadder();
    await submitLadderQuestion(0);
    await submitLadderQuestion(1);
    const firstPayload = activities[0]?.payload as { destinationColumn: number };
    firstPayload.destinationColumn = firstPayload.destinationColumn === 0 ? 1 : 0;

    const response = await submitLadderQuestion(2);

    expect(response.status).toBe(409);
    expect(pointLogs).toHaveLength(0);
  });

  it("서로 다른 마지막 질문이 동시에 오면 한 요청만 정산한다", async () => {
    await createLadder();
    await submitLadderQuestion(0);
    await submitLadderQuestion(1);

    const responses = await Promise.all([
      submitLadderQuestion(2, 3, "첫 번째 마지막 사다리 질문은 무엇일까요?"),
      postAction({
        action: "ladder-submit-question",
        requestId: ALTERNATE_FINAL_ACTION_ID,
        expectedVersion: 3,
        startColumn: 1,
        question: "두 번째 마지막 사다리 질문은 무엇일까요?",
        locale: "ko",
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(pointLogs).toHaveLength(1);
    expect(activities.filter((activity) => activity.type === "LADDER_QUESTION")).toHaveLength(3);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("마지막 활동 저장이 실패하면 질문과 포인트를 모두 되돌리고 재시도한다", async () => {
    await createLadder();
    await submitLadderQuestion(0);
    await submitLadderQuestion(1);
    mocks.activityCreate.mockRejectedValueOnce(new Error("private-ladder-storage-value"));

    const failed = await submitLadderQuestion(2);

    expect(failed.status).toBe(500);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 3 });
    expect(activities).toHaveLength(2);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);

    const retry = await submitLadderQuestion(2);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ result: { awarded: 5 } });
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("교사 미리보기는 완료 결과만 남기고 포인트를 만들지 않는다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    await createLadder();
    await submitLadderQuestion(0);
    await submitLadderQuestion(1);

    const final = await submitLadderQuestion(2);

    expect(final.status).toBe(200);
    await expect(final.json()).resolves.toMatchObject({
      run: { preview: true, status: "SETTLED" },
      result: { awarded: 0, preview: true },
    });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("teacher-1")?.totalPoints).toBe(0);
  });

  it("혼자 모드 하루 상한에 이 점만 남으면 이 점만 지급한다", async () => {
    pointLogs.push({
      studentId: "student-1",
      gameId: "ACTIVITY_SOLO",
      gameRunId: "old-run",
      bonusType: "ACTIVITY_SOLO_relay",
      points: 28,
      reason: "이전 실행",
      status: "APPROVED",
      createdAt: new Date(),
    });
    await createLadder();
    await submitLadderQuestion(0);
    await submitLadderQuestion(1);

    const final = await submitLadderQuestion(2);

    expect(final.status).toBe(200);
    await expect(final.json()).resolves.toMatchObject({
      result: { awarded: 2, dailyRemaining: 0, cappedByLimit: true },
    });
    expect(users.get("student-1")?.totalPoints).toBe(2);
  });

  it("잘못된 시작점과 중복 질문 및 다른 언어 질문을 기록하지 않는다", async () => {
    await createLadder();
    const invalidStart = await submitLadderQuestion(0, 1, undefined, 4);
    const first = await submitLadderQuestion(0);
    const duplicate = await submitLadderQuestion(1, 2, "사다리 질문 1은 왜 필요할까요?");
    const wrongLocale = await postAction({
      action: "ladder-submit-question",
      requestId: ACTION_IDS[1],
      expectedVersion: 2,
      startColumn: 0,
      question: "Why should this ladder question be asked?",
      locale: "en",
    });

    expect(invalidStart.status).toBe(400);
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(409);
    expect(wrongLocale.status).toBe(409);
    expect(activities).toHaveLength(1);
    expect(runs.get("run-1")).toMatchObject({ version: 2 });
  });
});

describe("까바놀이 서버 실행 경로", () => {
  it("만료된 실행을 한 단계 오른 버전으로 닫고 결과를 읽는다", async () => {
    await createKaba();
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    run.expiresAt = new Date(0);

    const response = await readResult();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: { status: "EXPIRED", version: 2, questionCount: 0 },
      result: null,
    });
  });

  it("활성 상한으로 자동 포기된 실행을 같은 생성 요청으로 다시 읽는다", async () => {
    await createKaba();
    for (const requestId of [SECOND_CREATE_ID, THIRD_CREATE_ID, FOURTH_CREATE_ID]) {
      await postCreate({ gameId: "kaba", mode: "solo", requestId, locale: "ko" });
    }

    const replay = await createKaba();

    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      run: { id: "run-1", status: "ABANDONED", version: 2, questionCount: 0 },
    });
  });

  it("주제 없이 서로 다른 서버 문장 열 개를 만들고 같은 생성 요청에는 같은 계획을 돌려준다", async () => {
    const response = await createKaba();
    const body = await response.json() as {
      run: { currentSentence: string; correctCount: number; kabaNextStep: string };
    };
    const state = runs.get("run-1")?.state as { sentencePlan: string[] };
    const replay = await createKaba();

    expect(response.status).toBe(201);
    expect(body.run).toMatchObject({
      questionCount: 0,
      correctCount: 0,
      currentSentence: expect.any(String),
      kabaNextStep: "STUDENT_ATTEMPT",
    });
    expect(state.sentencePlan).toHaveLength(10);
    expect(new Set(state.sentencePlan)).toHaveProperty("size", 10);
    expect(state.sentencePlan.every((key) => /^kaba-\d{2}$/.test(key))).toBe(true);
    expect(JSON.stringify(state)).not.toContain(body.run.currentSentence);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      run: { currentSentence: body.run.currentSentence },
    });
  });

  it("서버가 질문 꼴을 판정하고 화면의 문장과 정답값을 무시하며 같은 요청을 한 번만 기록한다", async () => {
    await createKaba();
    const state = runs.get("run-1")?.state as { sentencePlan: string[] };
    const catIndex = state.sentencePlan.indexOf("kaba-01");
    if (catIndex >= 0) {
      [state.sentencePlan[0], state.sentencePlan[catIndex]] = [
        state.sentencePlan[catIndex],
        state.sentencePlan[0],
      ];
    } else {
      state.sentencePlan[0] = "kaba-01";
    }
    const correct = await submitKabaAttempt(
      0,
      "고양이가 자나요?",
      1,
      "run-1",
      "ko",
      { sentence: "화면이 바꾼 문장", correct: false },
    );
    const replay = await submitKabaAttempt(
      0,
      "고양이가 자나요?",
      1,
      "run-1",
      "ko",
      { sentence: "다른 화면 문장", correct: true },
    );
    const conflictingReplay = await submitKabaAttempt(
      0,
      "같은 요청의 다른 질문인가요?",
      1,
    );
    const incorrect = await submitKabaAttempt(
      1,
      "이 문장은 질문이 아닙니다",
      2,
      "run-1",
      "ko",
      { sentence: "또 다른 문장", correct: true },
    );

    expect(correct.status).toBe(200);
    await expect(correct.json()).resolves.toMatchObject({
      correct: true,
      run: { questionCount: 1, correctCount: 1 },
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      correct: true,
      replayed: true,
      run: { version: 2, questionCount: 1 },
    });
    expect(conflictingReplay.status).toBe(409);
    expect(incorrect.status).toBe(200);
    await expect(incorrect.json()).resolves.toMatchObject({
      correct: false,
      run: { questionCount: 2, correctCount: 1 },
    });
    expect(activities).toHaveLength(2);
    for (const activity of activities) {
      expect(Object.keys(activity.payload as Record<string, unknown>).sort()).toEqual([
        "correct",
        "inputHash",
        "inputLength",
        "sentenceKey",
      ]);
    }
    const stored = JSON.stringify({ state: runs.get("run-1")?.state, activities });
    expect(stored).not.toContain("고양이가 자나요?");
    expect(stored).not.toContain("이 문장은 질문이 아닙니다");
    expect(stored).not.toContain("화면이 바꾼 문장");
  });

  it("원문과 다른 내용을 질문 꼴로만 바꾼 시도는 정답으로 기록하지 않는다", async () => {
    await createKaba();
    const state = runs.get("run-1")?.state as { sentencePlan: string[] };
    const frogIndex = state.sentencePlan.indexOf("kaba-24");
    if (frogIndex >= 0) {
      [state.sentencePlan[0], state.sentencePlan[frogIndex]] = [
        state.sentencePlan[frogIndex],
        state.sentencePlan[0],
      ];
    } else {
      state.sentencePlan[0] = "kaba-24";
    }

    const response = await submitKabaAttempt(0, "개구리가 노나요?");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      correct: false,
      run: { questionCount: 1, correctCount: 0 },
    });
  });

  it("혼자 모드 정답 열 개를 확인해 십이 점을 정산하고 재전송과 결과 조회 및 완료 요청으로 복구한다", async () => {
    await createKaba();
    const questions: string[] = [];
    let final: Response | undefined;
    for (let index = 0; index < 10; index += 1) {
      const state = runs.get("run-1")?.state as { questionCount: number; sentencePlan: string[] };
      const sentenceIndex = Number(state.sentencePlan[state.questionCount].slice(-2)) - 1;
      const question = KABA_VALID_QUESTIONS.ko[sentenceIndex];
      questions.push(question);
      final = await submitKabaAttempt(index, question);
      expect(final.status).toBe(200);
    }
    if (!final) throw new Error("missing final response");

    await expect(final.json()).resolves.toMatchObject({
      correct: true,
      run: {
        status: "SETTLED",
        version: 11,
        questionCount: 10,
        correctCount: 10,
        currentSentence: null,
        kabaNextStep: "COMPLETE",
      },
      result: { awarded: 12, dailyLimit: 30, preview: false },
    });
    expect(pointLogs).toHaveLength(1);
    expect(pointLogs[0]).toMatchObject({
      gameId: "ACTIVITY_SOLO",
      bonusType: "ACTIVITY_SOLO_kaba",
      points: 12,
    });
    expect(users.get("student-1")?.totalPoints).toBe(12);
    expect(activities).toHaveLength(10);
    expect(activities.reduce((sum, activity) => sum + activity.validQuestionCount, 0)).toBe(10);
    for (const question of questions) {
      expect(JSON.stringify({ state: runs.get("run-1")?.state, activities })).not.toContain(question);
    }

    const replay = await submitKabaAttempt(9, questions[9]);
    const result = await readResult();
    const complete = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 11 });
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      correct: true,
      result: { awarded: 12 },
    });
    await expect(result.json()).resolves.toMatchObject({
      run: { status: "SETTLED", currentSentence: null, kabaNextStep: "COMPLETE" },
      result: { awarded: 12, alreadySettled: true },
    });
    await expect(complete.json()).resolves.toMatchObject({
      replayed: true,
      result: { awarded: 12, alreadySettled: true },
    });
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(12);
  });

  it("인공지능 모드는 서버 정답 일곱 개만 점수 근거로 삼아 십칠 점을 정산한다", async () => {
    await createKaba("ai");
    let final: Response | undefined;
    for (let index = 0; index < 10; index += 1) {
      const question = index < 7
        ? undefined
        : `${index + 1}번째 문장은 평서문입니다`;
      final = await submitKabaAttempt(index, question);
    }
    if (!final) throw new Error("missing final response");

    await expect(final.json()).resolves.toMatchObject({
      correct: false,
      run: { status: "SETTLED", questionCount: 10, correctCount: 7, aiTurnCount: 0 },
      result: { awarded: 17, dailyLimit: 50 },
    });
    expect(pointLogs[0]).toMatchObject({ gameId: "ACTIVITY_AI", points: 17 });
    expect(users.get("student-1")?.totalPoints).toBe(17);
  });

  it("마지막 시도 전에 서버 활동이 빠지면 정산을 거부한다", async () => {
    await createKaba();
    for (let index = 0; index < 9; index += 1) {
      await submitKabaAttempt(index);
    }
    activities.splice(0, 1);

    const response = await submitKabaAttempt(9);

    expect(response.status).toBe(409);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 10 });
    expect(activities).toHaveLength(8);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it("마지막 시도 전에 저장된 문장 키가 서버 계획과 달라지면 정산을 거부한다", async () => {
    await createKaba();
    for (let index = 0; index < 9; index += 1) {
      await submitKabaAttempt(index);
    }
    const firstPayload = activities[0]?.payload as { sentenceKey: string };
    firstPayload.sentenceKey = "kaba-99";

    const response = await submitKabaAttempt(9);

    expect(response.status).toBe(409);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 10 });
    expect(activities).toHaveLength(9);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it("서로 다른 마지막 시도가 동시에 오면 한 요청만 정산한다", async () => {
    await createKaba();
    for (let index = 0; index < 9; index += 1) {
      await submitKabaAttempt(index);
    }

    const responses = await Promise.all([
      submitKabaAttempt(9),
      postAction({
        action: "kaba-submit-attempt",
        requestId: KABA_ALTERNATE_FINAL_ACTION_ID,
        expectedVersion: 10,
        question: (() => {
          const state = runs.get("run-1")?.state as { questionCount: number; sentencePlan: string[] };
          const sentenceIndex = Number(state.sentencePlan[state.questionCount].slice(-2)) - 1;
          return KABA_VALID_QUESTIONS.ko[sentenceIndex];
        })(),
        locale: "ko",
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(pointLogs).toHaveLength(1);
    expect(activities.filter((activity) => activity.type === "KABA_ATTEMPT")).toHaveLength(10);
    expect(users.get("student-1")?.totalPoints).toBe(12);
  });

  it("마지막 활동 저장 실패는 시도와 포인트를 모두 되돌리고 같은 요청 재시도로 정산한다", async () => {
    await createKaba();
    for (let index = 0; index < 9; index += 1) {
      await submitKabaAttempt(index);
    }
    mocks.activityCreate.mockRejectedValueOnce(new Error("private-kaba-storage-value"));

    const failed = await submitKabaAttempt(9);

    expect(failed.status).toBe(500);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 10 });
    expect(activities).toHaveLength(9);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);

    const retry = await submitKabaAttempt(9);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ result: { awarded: 12 } });
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(12);
  });

  it("교사 미리보기는 서버 판정 결과만 남기고 포인트를 만들지 않는다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    await createKaba();
    let final: Response | undefined;
    for (let index = 0; index < 10; index += 1) {
      final = await submitKabaAttempt(index);
    }
    if (!final) throw new Error("missing final response");

    await expect(final.json()).resolves.toMatchObject({
      run: { preview: true, status: "SETTLED", correctCount: 10 },
      result: { awarded: 0, preview: true },
    });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("teacher-1")?.totalPoints).toBe(0);
  });

  it("혼자 모드 하루 상한에 이 점만 남으면 이 점만 지급한다", async () => {
    pointLogs.push({
      studentId: "student-1",
      gameId: "ACTIVITY_SOLO",
      gameRunId: "old-run",
      bonusType: "ACTIVITY_SOLO_relay",
      points: 28,
      reason: "이전 실행",
      status: "APPROVED",
      createdAt: new Date(),
    });
    await createKaba();
    let final: Response | undefined;
    for (let index = 0; index < 10; index += 1) {
      final = await submitKabaAttempt(index);
    }
    if (!final) throw new Error("missing final response");

    await expect(final.json()).resolves.toMatchObject({
      result: { awarded: 2, dailyRemaining: 0, cappedByLimit: true },
    });
    expect(users.get("student-1")?.totalPoints).toBe(2);
    expect(pointLogs.filter((log) => log.gameRunId === "run-1")).toHaveLength(1);
  });

  it("빈 입력과 문장 부호 및 비속어와 다른 실행 언어는 활동으로 기록하지 않는다", async () => {
    await createKaba();
    const punctuation = await submitKabaAttempt(0, "???");
    const profanity = await submitKabaAttempt(0, "fuck인가요?");
    const wrongLocale = await submitKabaAttempt(
      0,
      "Is this a question?",
      1,
      "run-1",
      "en",
    );

    expect(punctuation.status).toBe(400);
    expect(profanity.status).toBe(400);
    expect(wrongLocale.status).toBe(409);
    expect(activities).toHaveLength(0);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 1 });
  });
});

describe("이야기 주사위 서버 실행 경로", () => {
  it("주제 없이 이중 언어 단어를 여덟 개씩 준비하고 서버 굴림을 재생한다", async () => {
    const created = await createStoryDice("solo", "en");
    const createdBody = await created.json() as {
      run: {
        storyWordPool: Record<"protagonist" | "place" | "event", string[]>;
        storyRolledWords: null;
      };
    };
    const rolled = await rollStoryDiceRun();
    const replay = await rollStoryDiceRun();
    const rolledBody = await rolled.json();
    const replayBody = await replay.json();

    expect(created.status).toBe(201);
    expect(createdBody.run.storyRolledWords).toBeNull();
    for (const words of Object.values(createdBody.run.storyWordPool)) {
      expect(words).toHaveLength(8);
      expect(new Set(words).size).toBe(8);
    }
    expect(rolledBody).toMatchObject({
      run: {
        version: 2,
        storyDiceNextStep: "STORY",
        storyRolledWords: {
          protagonist: expect.any(String),
          place: expect.any(String),
          event: expect.any(String),
        },
      },
      replayed: false,
    });
    expect(replay.status).toBe(200);
    expect(replayBody).toMatchObject({
      run: rolledBody.run,
      replayed: true,
    });
    expect(activities).toHaveLength(1);
  });

  it("혼자 모드의 세 질문과 대답 쌍을 확인해 오 점을 한 번 지급하고 원문을 저장하지 않는다", async () => {
    const played = await playSoloStoryDice();
    const final = played.responses.at(-1);
    if (!final) throw new Error("missing final response");
    const finalBody = await final.json();

    expect(finalBody).toMatchObject({
      run: {
        status: "SETTLED",
        version: 9,
        questionCount: 3,
        aiTurnCount: 0,
        awaitingAiTurn: false,
        storyDiceNextStep: "COMPLETE",
      },
      result: { awarded: 5, dailyLimit: 30, preview: false },
      replayed: false,
    });
    expect(pointLogs).toHaveLength(1);
    expect(pointLogs[0]).toMatchObject({
      gameId: "ACTIVITY_SOLO",
      bonusType: "ACTIVITY_SOLO_story-dice",
      points: 5,
    });
    expect(users.get("student-1")?.totalPoints).toBe(5);
    expect(activities).toHaveLength(8);
    expect(activities.reduce((sum, activity) => sum + activity.validQuestionCount, 0)).toBe(3);

    const stored = JSON.stringify({
      state: runs.get("run-1")?.state,
      activities: activities.map(({ payload, responseSnapshot, requestFingerprint }) => ({
        payload,
        responseSnapshot,
        requestFingerprint,
      })),
    });
    for (const raw of [played.story, ...played.questions, ...played.answers]) {
      expect(stored).not.toContain(raw);
    }

    const replay = await submitStoryDiceAnswer(2, 8, played.answers[2]);
    const result = await readResult();
    const complete = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 9 });
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      result: { awarded: 5 },
    });
    await expect(result.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 9 },
      result: { awarded: 5, alreadySettled: true },
    });
    await expect(complete.json()).resolves.toMatchObject({
      replayed: true,
      result: { awarded: 5, alreadySettled: true },
    });
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("인공지능 질문 세 개의 서명과 학생 대답 세 개를 확인해 구 점을 지급한다", async () => {
    const played = await playAiStoryDice();
    const final = played.responses.at(-1);
    if (!final) throw new Error("missing final response");

    await expect(final.json()).resolves.toMatchObject({
      run: {
        status: "SETTLED",
        version: 9,
        questionCount: 3,
        aiTurnCount: 3,
        storyDiceNextStep: "COMPLETE",
      },
      result: { awarded: 9, dailyLimit: 50, preview: false },
    });
    expect(pointLogs[0]).toMatchObject({
      gameId: "ACTIVITY_AI",
      bonusType: "ACTIVITY_AI_story-dice",
      points: 9,
    });
    expect(users.get("student-1")?.totalPoints).toBe(9);
    expect(activities.filter((activity) =>
      activity.type === "STORY_DICE_AI_QUESTION"
    )).toHaveLength(3);
    const stored = JSON.stringify({ state: runs.get("run-1")?.state, activities });
    for (const raw of [played.story, ...played.answers]) {
      expect(stored).not.toContain(raw);
    }
  });

  it("위조된 이야기 질문 증명과 다른 이야기 문맥을 활동으로 기록하지 않는다", async () => {
    const prepared = await prepareStoryDice("ai");
    const wrongContext = await requestStoryDiceAiQuestion(
      0,
      3,
      `${prepared.story} 다른 이야기`,
      "",
    );
    const issued = await requestStoryDiceAiQuestion(0, 3, prepared.story, "");
    const issuedBody = await issued.json() as { output: string; proof: string };
    const forged = await recordStoryDiceAiQuestion(
      0,
      3,
      issuedBody.output,
      `${issuedBody.proof}x`,
    );

    expect(wrongContext.status).toBe(409);
    expect(forged.status).toBe(409);
    expect(activities).toHaveLength(2);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 3 });
    expect(pointLogs).toHaveLength(0);
  });

  it("모델 호출이 실패해도 서명한 안전 질문으로 인공지능 차례를 이어 간다", async () => {
    const prepared = await prepareStoryDice("ai");
    mocks.generateText.mockRejectedValueOnce(new Error("private-story-ai-error"));

    const issued = await requestStoryDiceAiQuestion(0, 3, prepared.story, "");
    const issuedBody = await issued.json() as { output: string; proof: string };
    const recorded = await recordStoryDiceAiQuestion(
      0,
      3,
      issuedBody.output,
      issuedBody.proof,
    );

    expect(issued.status).toBe(200);
    expect(issuedBody.output).toBe("그다음에는 어떤 일이 있었나요?");
    expect(issuedBody.proof).toEqual(expect.any(String));
    expect(recorded.status).toBe(200);
    await expect(recorded.json()).resolves.toMatchObject({
      run: { version: 4, aiTurnCount: 1, storyDiceNextStep: "STUDENT_ANSWER" },
    });
  });

  it("앞 회차 질문과 기본 대체 질문이 겹쳐도 사용하지 않은 질문으로 다음 차례를 이어 간다", async () => {
    const prepared = await prepareStoryDice("ai");
    const firstQuestion = "주인공은 왜 그렇게 행동했나요?";
    const firstAnswer = "그곳이 궁금했기 때문이에요.";
    mocks.generateText
      .mockResolvedValueOnce(firstQuestion)
      .mockRejectedValueOnce(new Error("private-story-ai-error"));

    const firstIssued = await requestStoryDiceAiQuestion(0, 3, prepared.story, "");
    const firstIssuedBody = await firstIssued.json() as { output: string; proof: string };
    const firstRecorded = await recordStoryDiceAiQuestion(
      0,
      3,
      firstIssuedBody.output,
      firstIssuedBody.proof,
    );
    const firstAnswered = await submitStoryDiceAnswer(0, 4, firstAnswer);
    const secondIssued = await requestStoryDiceAiQuestion(
      1,
      5,
      prepared.story,
      firstAnswer,
    );
    const secondIssuedBody = await secondIssued.json() as { output: string; proof: string };

    expect(firstIssued.status).toBe(200);
    expect(firstIssuedBody.output).toBe(firstQuestion);
    expect(firstRecorded.status).toBe(200);
    expect(firstAnswered.status).toBe(200);
    expect(secondIssued.status).toBe(200);
    expect(secondIssuedBody.output).not.toBe(firstQuestion);
    expect(secondIssuedBody.output).toMatch(/\?$/);
    expect(secondIssuedBody.proof).toEqual(expect.any(String));

    const secondRecorded = await recordStoryDiceAiQuestion(
      1,
      5,
      secondIssuedBody.output,
      secondIssuedBody.proof,
    );
    expect(secondRecorded.status).toBe(200);
    await expect(secondRecorded.json()).resolves.toMatchObject({
      run: { version: 6, aiTurnCount: 2, storyDiceNextStep: "STUDENT_ANSWER" },
    });
  });

  it("마지막 대답 전에 저장된 활동 근거가 빠지면 정산하지 않는다", async () => {
    const prepared = await prepareStoryDice("solo");
    const questions = ["첫 질문은 무엇인가요?", "둘 질문은 무엇인가요?", "셋 질문은 무엇인가요?"];
    const answers = ["첫 대답입니다.", "둘 대답입니다."];
    await submitStoryDiceQuestion(0, 3, questions[0]);
    await submitStoryDiceAnswer(0, 4, answers[0]);
    await submitStoryDiceQuestion(1, 5, questions[1]);
    await submitStoryDiceAnswer(1, 6, answers[1]);
    await submitStoryDiceQuestion(2, 7, questions[2]);
    activities.splice(0, 1);

    const response = await submitStoryDiceAnswer(2, 8, "셋 대답입니다.");

    expect(response.status).toBe(409);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 8 });
    expect(activities).toHaveLength(6);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
    expect(JSON.stringify(runs.get("run-1")?.state)).not.toContain(prepared.story);
  });

  it("서로 다른 마지막 대답이 동시에 오면 한 요청만 정산한다", async () => {
    await prepareStoryDice("solo");
    await submitStoryDiceQuestion(0, 3, "첫 질문은 무엇인가요?");
    await submitStoryDiceAnswer(0, 4, "첫 대답입니다.");
    await submitStoryDiceQuestion(1, 5, "둘 질문은 무엇인가요?");
    await submitStoryDiceAnswer(1, 6, "둘 대답입니다.");
    await submitStoryDiceQuestion(2, 7, "셋 질문은 무엇인가요?");

    const responses = await Promise.all([
      submitStoryDiceAnswer(2, 8, "첫 번째 마지막 대답입니다."),
      postAction({
        action: "story-dice-submit-answer",
        requestId: STORY_ALTERNATE_FINAL_ACTION_ID,
        expectedVersion: 8,
        answer: "두 번째 마지막 대답입니다.",
        locale: "ko",
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(pointLogs).toHaveLength(1);
    expect(activities.filter((activity) =>
      activity.type === "STORY_DICE_ANSWER"
    )).toHaveLength(3);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("마지막 대답 저장 실패는 실행과 활동 및 점수를 모두 되돌리고 재시도한다", async () => {
    await prepareStoryDice("solo");
    await submitStoryDiceQuestion(0, 3, "첫 질문은 무엇인가요?");
    await submitStoryDiceAnswer(0, 4, "첫 대답입니다.");
    await submitStoryDiceQuestion(1, 5, "둘 질문은 무엇인가요?");
    await submitStoryDiceAnswer(1, 6, "둘 대답입니다.");
    await submitStoryDiceQuestion(2, 7, "셋 질문은 무엇인가요?");
    mocks.activityCreate.mockRejectedValueOnce(new Error("private-story-storage-value"));

    const failed = await submitStoryDiceAnswer(2, 8, "셋 대답입니다.");

    expect(failed.status).toBe(500);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 8 });
    expect(activities).toHaveLength(7);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);

    const retry = await submitStoryDiceAnswer(2, 8, "셋 대답입니다.");
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ result: { awarded: 5 } });
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(5);
  });

  it("교사 미리보기는 같은 완료 결과를 남기되 포인트를 만들지 않는다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    const played = await playSoloStoryDice();
    const final = played.responses.at(-1);
    if (!final) throw new Error("missing final response");

    await expect(final.json()).resolves.toMatchObject({
      run: { preview: true, status: "SETTLED", questionCount: 3 },
      result: { awarded: 0, preview: true },
    });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("teacher-1")?.totalPoints).toBe(0);
  });

  it("만료된 실행은 임시 인공지능 자료 없이 한 단계 오른 버전으로 닫는다", async () => {
    await createStoryDice("ai");
    const run = runs.get("run-1");
    if (!run) throw new Error("missing run");
    run.expiresAt = new Date(0);

    const response = await readResult();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: {
        status: "EXPIRED",
        version: 2,
        storyDiceNextStep: "ROLL",
        storyRolledWords: null,
      },
      result: null,
    });
  });
});

describe("카드 짝 찾기 서버 실행 경로", () => {
  it("난이도별 고정 이중 언어 카드 계획을 만들고 숨은 짝 키를 공개하지 않는다", async () => {
    const missingDifficulty = await postCreate({
      gameId: "memory",
      mode: "solo",
      requestId: CREATE_ID,
      locale: "ko",
    });
    const created = await createMemory("solo", "easy", "en");
    const body = await created.json() as {
      run: {
        memoryDifficulty: string;
        targetCount: number;
        memoryQuestionCards: Array<Record<string, unknown>>;
        memoryAnswerCards: Array<Record<string, unknown>>;
      };
    };
    const state = storedMemoryState();
    const replay = await createMemory("solo", "easy", "en");
    const conflictingReplay = await postCreate({
      gameId: "memory",
      mode: "solo",
      difficulty: "normal",
      requestId: CREATE_ID,
      locale: "en",
    });

    expect(missingDifficulty.status).toBe(400);
    expect(created.status).toBe(201);
    expect(body.run).toMatchObject({
      memoryDifficulty: "easy",
      targetCount: 18,
      memoryNextStep: "STUDENT_QUESTION",
      studentMatchCount: 0,
      aiMatchCount: 0,
    });
    expect(body.run.memoryQuestionCards).toHaveLength(6);
    expect(body.run.memoryAnswerCards).toHaveLength(6);
    expect([
      ...body.run.memoryQuestionCards,
      ...body.run.memoryAnswerCards,
    ].every((card) =>
      card.state === "HIDDEN" &&
      card.contentKey === undefined &&
      card.pairKey === undefined
    )).toBe(true);
    expect(state.pairs).toHaveLength(6);
    expect(new Set(state.pairs.map(({ contentKey }) => contentKey)).size).toBe(6);
    expect(state.pairs.every(({ contentKey }) =>
      /^memory-pair-(0[1-9]|1[0-9]|20)$/.test(contentKey)
    )).toBe(true);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ replayed: true, run: body.run });
    expect(conflictingReplay.status).toBe(409);
  });

  it("질문 카드 다음에만 대답 카드를 받고 같은 요청 재전송과 다른 입력을 구분한다", async () => {
    await createMemory();
    const first = memoryPairCards(0);
    const second = memoryPairCards(1);
    const answerFirst = await flipMemoryCard(0, 1, first.answer.id);
    const question = await flipMemoryCard(0, 1, first.question.id);
    const replay = await flipMemoryCard(0, 1, first.question.id);
    const conflictingReplay = await flipMemoryCard(0, 1, second.question.id);

    expect(answerFirst.status).toBe(400);
    expect(question.status).toBe(200);
    await expect(question.json()).resolves.toMatchObject({
      run: {
        version: 2,
        memoryNextStep: "STUDENT_ANSWER",
        questionCount: 0,
      },
      replayed: false,
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      run: { version: 2 },
    });
    expect(conflictingReplay.status).toBe(409);
    expect(activities).toHaveLength(1);
  });

  it("틀린 두 카드를 천팔백 밀리초 공개한 뒤 혼자 모드 학생 차례로 복원한다", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-16T00:00:00.000Z"));
      await createMemory();
      const first = memoryPairCards(0);
      const second = memoryPairCards(1);
      await flipMemoryCard(0, 1, first.question.id);
      const missed = await flipMemoryCard(1, 2, second.answer.id);
      const missedBody = await missed.json() as {
        run: { memoryMissReveal: { id: string; resolveAt: number } };
      };
      const early = await resolveMemoryMiss(2, 3, missedBody.run.memoryMissReveal.id);
      vi.setSystemTime(new Date("2026-07-16T00:00:01.800Z"));
      const resolved = await resolveMemoryMiss(2, 3, missedBody.run.memoryMissReveal.id);

      expect(missedBody).toMatchObject({
        run: {
          version: 3,
          questionCount: 1,
          memoryNextStep: "RESOLVE_MISS",
          memoryMissReveal: {
            actor: "STUDENT",
            result: "MISS",
          },
        },
      });
      expect(early.status).toBe(409);
      expect(resolved.status).toBe(200);
      await expect(resolved.json()).resolves.toMatchObject({
        run: {
          version: 4,
          memoryNextStep: "STUDENT_QUESTION",
          memoryMissReveal: null,
        },
      });
      expect(activities).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("인공지능은 클라이언트 카드값을 무시하고 서버가 기억한 짝을 얻는다", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-16T01:00:00.000Z"));
      await createMemory("ai");
      const first = memoryPairCards(0);
      const second = memoryPairCards(1);
      await flipMemoryCard(0, 1, first.question.id);
      await flipMemoryCard(1, 2, second.answer.id);
      const revealId = storedMemoryState().pendingMiss?.id;
      if (!revealId) throw new Error("missing reveal id");
      vi.setSystemTime(new Date("2026-07-16T01:00:01.800Z"));
      await resolveMemoryMiss(2, 3, revealId);
      storedMemoryState().seenCardIds.push(second.question.id);

      const aiTurn = await runMemoryAiTurn(3, 4, "run-1", {
        cardId: first.answer.id,
        questionCardId: first.question.id,
      });

      expect(aiTurn.status).toBe(200);
      await expect(aiTurn.json()).resolves.toMatchObject({
        run: {
          version: 5,
          questionCount: 2,
          aiTurnCount: 1,
          studentMatchCount: 0,
          aiMatchCount: 1,
          memoryNextStep: "AI_TURN",
        },
      });
      expect(activities.at(-1)?.payload).toMatchObject({
        actor: "AI",
        questionCardId: second.question.id,
        answerCardId: second.answer.id,
        result: "MATCH",
      });
      expect(JSON.stringify(activities.at(-1)?.payload)).not.toContain(first.answer.id);
      expect(pointLogs).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["solo", 8, 30],
    ["ai", 15, 50],
  ] as const)(
    "%s 모드는 학생이 찾은 여섯 짝만 점수로 삼아 즉시 정산한다",
    async (mode, awarded, dailyLimit) => {
      const played = await playAllStudentMemoryMatches(mode);
      const final = played.responses.at(-1);
      if (!final) throw new Error("missing final response");
      const finalBody = await final.json();

      expect(finalBody).toMatchObject({
        run: {
          status: "SETTLED",
          version: 13,
          questionCount: 6,
          aiTurnCount: 0,
          studentMatchCount: 6,
          aiMatchCount: 0,
          memoryNextStep: "COMPLETE",
          memoryReview: expect.arrayContaining([
            { contentKey: expect.stringMatching(/^memory-pair-/) },
          ]),
        },
        result: { awarded, dailyLimit, preview: false },
        replayed: false,
      });
      expect(pointLogs).toHaveLength(1);
      expect(pointLogs[0]).toMatchObject({
        gameId: mode === "solo" ? "ACTIVITY_SOLO" : "ACTIVITY_AI",
        bonusType: `${mode === "solo" ? "ACTIVITY_SOLO" : "ACTIVITY_AI"}_memory`,
        points: awarded,
      });
      expect(users.get("student-1")?.totalPoints).toBe(awarded);
      expect(activities).toHaveLength(12);
      expect(activities.reduce(
        (sum, activity) => sum + activity.validQuestionCount,
        0,
      )).toBe(6);
      expect(activities.every((activity) =>
        !JSON.stringify(activity.responseSnapshot).includes("pairKey") &&
        !JSON.stringify(activity.payload).includes("pairKey")
      )).toBe(true);
    },
  );

  it("최대 시도의 마지막 실패는 공개 해제 뒤 이 점으로 정산한다", async () => {
    vi.useFakeTimers();
    try {
      let now = Date.parse("2026-07-16T02:00:00.000Z");
      vi.setSystemTime(now);
      await createMemory();
      const first = memoryPairCards(0);
      const second = memoryPairCards(1);
      let version = 1;
      let final: Response | undefined;
      for (let attempt = 0; attempt < 18; attempt += 1) {
        await flipMemoryCard(attempt * 3, version, first.question.id);
        version += 1;
        const missed = await flipMemoryCard(attempt * 3 + 1, version, second.answer.id);
        version += 1;
        if (attempt === 17) {
          await expect(missed.json()).resolves.toMatchObject({
            run: {
              questionCount: 18,
              memoryNextStep: "RESOLVE_MISS",
              status: "ACTIVE",
            },
          });
        }
        const revealId = storedMemoryState().pendingMiss?.id;
        if (!revealId) throw new Error("missing reveal id");
        now += 1_800;
        vi.setSystemTime(now);
        databaseClock = new Date(now);
        final = await resolveMemoryMiss(attempt * 3 + 2, version, revealId);
        version += 1;
      }
      if (!final) throw new Error("missing final response");

      expect(final.status).toBe(200);
      await expect(final.json()).resolves.toMatchObject({
        run: {
          status: "SETTLED",
          version: 55,
          questionCount: 18,
          studentMatchCount: 0,
          memoryNextStep: "COMPLETE",
        },
        result: { awarded: 2 },
      });
      expect(activities).toHaveLength(54);
      expect(pointLogs).toHaveLength(1);
      expect(users.get("student-1")?.totalPoints).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("마지막 짝 전에 활동 근거가 빠지면 정산하지 않는다", async () => {
    await createMemory();
    let version = 1;
    for (let index = 0; index < 5; index += 1) {
      const { question, answer } = memoryPairCards(index);
      await flipMemoryCard(index * 2, version, question.id);
      version += 1;
      await flipMemoryCard(index * 2 + 1, version, answer.id);
      version += 1;
    }
    const last = memoryPairCards(5);
    await flipMemoryCard(10, version, last.question.id);
    version += 1;
    activities.splice(0, 1);

    const response = await flipMemoryCard(11, version, last.answer.id);

    expect(response.status).toBe(409);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 12 });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it("서로 같은 마지막 짝 요청이 동시에 오면 한 요청만 정산한다", async () => {
    await createMemory();
    let version = 1;
    for (let index = 0; index < 5; index += 1) {
      const { question, answer } = memoryPairCards(index);
      await flipMemoryCard(index * 2, version, question.id);
      version += 1;
      await flipMemoryCard(index * 2 + 1, version, answer.id);
      version += 1;
    }
    const last = memoryPairCards(5);
    await flipMemoryCard(10, version, last.question.id);
    version += 1;

    const responses = await Promise.all([
      flipMemoryCard(11, version, last.answer.id),
      flipMemoryCard(11, version, last.answer.id, "run-1", MEMORY_ALTERNATE_FINAL_ACTION_ID),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(pointLogs).toHaveLength(1);
    expect(activities).toHaveLength(12);
    expect(users.get("student-1")?.totalPoints).toBe(8);
  });

  it("마지막 활동 저장 실패는 실행과 점수를 모두 되돌리고 같은 요청으로 재시도한다", async () => {
    await createMemory();
    let version = 1;
    for (let index = 0; index < 5; index += 1) {
      const { question, answer } = memoryPairCards(index);
      await flipMemoryCard(index * 2, version, question.id);
      version += 1;
      await flipMemoryCard(index * 2 + 1, version, answer.id);
      version += 1;
    }
    const last = memoryPairCards(5);
    await flipMemoryCard(10, version, last.question.id);
    version += 1;
    mocks.activityCreate.mockRejectedValueOnce(new Error("private-memory-storage-value"));

    const failed = await flipMemoryCard(11, version, last.answer.id);

    expect(failed.status).toBe(500);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 12 });
    expect(activities).toHaveLength(11);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);

    const retry = await flipMemoryCard(11, version, last.answer.id);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ result: { awarded: 8 } });
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(8);
  });

  it("진행 중 수동 완료는 거절하고 자동 정산 뒤 완료 요청은 같은 결과를 돌려준다", async () => {
    await createMemory();
    const premature = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 1 });

    expect(premature.status).toBe(409);
    expect(pointLogs).toHaveLength(0);
    expect(activities).toHaveLength(0);

    const played = await playAllStudentMemoryMatches();
    expect(played.responses.at(-1)?.status).toBe(200);
    const completed = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 13 });

    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toMatchObject({
      run: { status: "SETTLED", version: 13, memoryNextStep: "COMPLETE" },
      result: { awarded: 8, alreadySettled: true },
      replayed: true,
    });
    expect(pointLogs).toHaveLength(1);
    expect(activities).toHaveLength(12);
  });

  it("교사 미리보기와 하루 상한 및 만료와 자동 포기를 공통 정책으로 처리한다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    const teacherPlay = await playAllStudentMemoryMatches("solo");
    const teacherFinal = teacherPlay.responses.at(-1);
    if (!teacherFinal) throw new Error("missing teacher final");
    await expect(teacherFinal.json()).resolves.toMatchObject({
      run: { preview: true, status: "SETTLED" },
      result: { awarded: 0, preview: true },
    });
    expect(pointLogs).toHaveLength(0);

    mocks.auth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    runs.clear();
    activities.splice(0);
    pointLogs.push({
      studentId: "student-1",
      gameId: "ACTIVITY_SOLO",
      gameRunId: "old-run",
      bonusType: "ACTIVITY_SOLO_relay",
      points: 29,
      reason: "이전 실행",
      status: "APPROVED",
      createdAt: new Date(),
    });
    const cappedPlay = await playAllStudentMemoryMatches("solo");
    const cappedFinal = cappedPlay.responses.at(-1);
    if (!cappedFinal) throw new Error("missing capped final");
    await expect(cappedFinal.json()).resolves.toMatchObject({
      result: { awarded: 1, dailyRemaining: 0, cappedByLimit: true },
    });
    expect(users.get("student-1")?.totalPoints).toBe(1);

    runs.clear();
    activities.splice(0);
    pointLogs.splice(0);
    await createMemory();
    const expiring = runs.get("run-1");
    if (!expiring) throw new Error("missing expiring run");
    expiring.expiresAt = new Date(0);
    const expired = await readResult();
    await expect(expired.json()).resolves.toMatchObject({
      run: { status: "EXPIRED", version: 2, memoryNextStep: "STUDENT_QUESTION" },
      result: null,
    });

    const expiredReplay = await createMemory();
    await expect(expiredReplay.json()).resolves.toMatchObject({
      replayed: true,
      run: { id: "run-1", status: "EXPIRED", version: 2 },
    });

    runs.clear();
    activities.splice(0);
    for (const requestId of [CREATE_ID, SECOND_CREATE_ID, THIRD_CREATE_ID, FOURTH_CREATE_ID]) {
      await postCreate({
        gameId: "memory",
        mode: "solo",
        difficulty: "easy",
        requestId,
        locale: "ko",
      });
    }
    const replay = await createMemory();
    await expect(replay.json()).resolves.toMatchObject({
      replayed: true,
      run: { id: "run-1", status: "ABANDONED", version: 2 },
    });
    expect([...runs.values()].filter((run) => run.status === "ACTIVE")).toHaveLength(3);
  });
});

describe("미스터리 박스 서버 실행 경로", () => {
  it("고정 비밀 물건을 서버에서 고르고 정산 전에는 어떤 공개 자료에도 내보내지 않는다", async () => {
    const extraTopic = await postCreate({
      gameId: "mystery-box",
      mode: "solo",
      requestId: CREATE_ID,
      locale: "ko",
      topic: "우주",
    });
    const created = await createMystery();
    const body = await created.json();
    const secret = mysterySecret();
    const replay = await createMystery();
    const serialized = JSON.stringify(body);

    expect(extraTopic.status).toBe(400);
    expect(created.status).toBe(201);
    expect(body).toMatchObject({
      run: {
        gameId: "mystery-box",
        status: "ACTIVE",
        version: 1,
        questionCount: 0,
        targetCount: 20,
        mysteryLocale: "ko",
        mysteryNextStep: "STUDENT_ACTION",
        mysteryActivityCount: 0,
        mysteryStudentQuestionCount: 0,
        mysteryHistory: [],
        mysteryWinner: null,
        mysteryEndReason: null,
        mysteryAnswerItemId: null,
      },
    });
    expect(serialized).not.toContain("privateItemId");
    expect(serialized).not.toContain(`"${secret.id}"`);
    expect(serialized).not.toContain(`"${secret.names.ko}"`);
    expect(serialized).not.toContain(`"${secret.names.en}"`);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ replayed: true, run: body.run });
  });

  it("규칙 질문을 원자적으로 기록하고 같은 요청 재생과 다른 질문을 구분한다", async () => {
    await createMystery();
    const secret = mysterySecret();
    const response = await submitMysteryQuestion(0, 1, "살아 있나요?");
    const replay = await submitMysteryQuestion(0, 1, "살아 있나요?");
    const conflict = await submitMysteryQuestion(0, 1, "동물인가요?");
    const duplicate = await submitMysteryQuestion(1, 2, "살아 있나요?");
    const expectedAnswer = secret.attributes.living ? "yes" : "no";

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      replayed: false,
      run: {
        version: 2,
        questionCount: 1,
        mysteryActivityCount: 1,
        mysteryStudentQuestionCount: 1,
        mysteryNextStep: "STUDENT_ACTION",
        mysteryHistory: [{
          sequence: 1,
          actor: "STUDENT",
          kind: "QUESTION",
          text: "살아 있나요?",
          answer: expectedAnswer,
        }],
        mysteryAnswerItemId: null,
      },
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ replayed: true });
    expect(conflict.status).toBe(409);
    expect(duplicate.status).toBe(409);
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      type: "MYSTERY_STUDENT_QUESTION",
      validQuestionCount: 1,
      sequence: 1,
    });
    const payload = JSON.stringify(activities[0].payload);
    expect(payload).not.toContain(secret.id);
    expect(payload).not.toMatch(/itemId|attribute|classification|private/u);
  });

  it("규칙 밖 학생 질문은 트랜잭션 밖 에이아이 판정 뒤 같은 요청으로 확정한다", async () => {
    await createMystery();
    mocks.generateJson.mockImplementationOnce(async () => {
      expect(transactionDepth).toBe(0);
      return { answer: "no" };
    });

    const response = await submitMysteryQuestion(0, 1, "학교에서 자주 볼 수 있나요?");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: {
        version: 2,
        questionCount: 1,
        mysteryStudentQuestionCount: 1,
        mysteryHistory: [{ answer: "no" }],
        mysteryAnswerItemId: null,
      },
    });
    expect(mocks.generateJson).toHaveBeenCalledOnce();
    expect(storedMysteryState().history[0]).toMatchObject({ answerSource: "AI" });
    expect(activities).toHaveLength(1);
    expect(JSON.stringify(activities[0].responseSnapshot)).not.toContain(
      storedMysteryState().privateItemId,
    );
  });

  it.each([
    ["unknown", 422, true],
    ["failure", 503, false],
  ] as const)(
    "외부 판정 %s은 학생 활동과 실행 버전을 소비하지 않는다",
    async (outcome, status, rewriteRequired) => {
      await createMystery();
      if (outcome === "unknown") {
        mocks.generateJson.mockResolvedValueOnce({ answer: "unknown" });
      } else {
        mocks.generateJson.mockRejectedValueOnce(new Error("private-provider-failure"));
      }

      const response = await submitMysteryQuestion(0, 1, "학교에서 자주 볼 수 있나요?");
      const body = await response.json();

      expect(response.status).toBe(status);
      if (rewriteRequired) {
        expect(body).toMatchObject({ mysteryRewriteRequired: true });
      } else {
        expect(body).toEqual({
          error: "미스터리 박스 질문 판정을 잠시 처리할 수 없습니다. 다시 시도해 주세요",
        });
        expect(JSON.stringify(body)).not.toContain("private-provider-failure");
        expect(JSON.stringify(body)).not.toContain(storedMysteryState().privateItemId);
      }
      expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 1 });
      expect(storedMysteryState()).toMatchObject({ questionCount: 0, history: [] });
      expect(activities).toHaveLength(0);
      expect(pointLogs).toHaveLength(0);
      expect(users.get("student-1")?.totalPoints).toBe(0);
    },
  );

  it("외부 판정 사이 실행이 바뀌면 늦은 판정을 버리고 어떤 자료나 점수도 더하지 않는다", async () => {
    await createMystery();
    let finishProvider: ((value: { answer: "yes" }) => void) | undefined;
    mocks.generateJson.mockImplementationOnce(() => new Promise((resolve) => {
      finishProvider = resolve;
    }));

    const pending = submitMysteryQuestion(0, 1, "학교에서 자주 볼 수 있나요?");
    await vi.waitFor(() => expect(mocks.generateJson).toHaveBeenCalledOnce());
    const competing = await submitMysteryGuess(1, 1, "없는 물건");
    expect(competing.status).toBe(200);
    finishProvider?.({ answer: "yes" });
    const late = await pending;

    expect(late.status).toBe(409);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 2 });
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ type: "MYSTERY_STUDENT_GUESS" });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it("외부 판정 대기 중 실행이 만료되면 늦은 판정을 버리고 정답을 공개하지 않는다", async () => {
    await createMystery();
    let finishProvider: ((value: { answer: "yes" }) => void) | undefined;
    mocks.generateJson.mockImplementationOnce(() => new Promise((resolve) => {
      finishProvider = resolve;
    }));

    const pending = submitMysteryQuestion(0, 1, "학교에서 자주 볼 수 있나요?");
    await vi.waitFor(() => expect(mocks.generateJson).toHaveBeenCalledOnce());
    const run = runs.get("run-1");
    if (!run) throw new Error("missing mystery run");
    run.expiresAt = new Date(0);
    const expired = await readResult();
    await expect(expired.json()).resolves.toMatchObject({
      run: {
        status: "EXPIRED",
        version: 2,
        mysteryAnswerItemId: null,
      },
      result: null,
    });
    finishProvider?.({ answer: "yes" });

    const late = await pending;
    expect(late.status).toBe(409);
    expect(runs.get("run-1")).toMatchObject({ status: "EXPIRED", version: 2 });
    expect(activities).toHaveLength(0);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
    expect(JSON.stringify(await late.json())).not.toContain(storedMysteryState().privateItemId);
  });

  it.each([
    ["runId", "run-other"],
    ["requestId", MYSTERY_ACTION_IDS[1]],
    ["expectedVersion", 2],
  ] as const)(
    "실행 전용 외부 판정 전달값 %s 변조를 두 번째 거래에서 거부한다",
    async (field, changedValue) => {
      await createMystery();
      const input = {
        action: "mystery-submit-question",
        requestId: MYSTERY_ACTION_IDS[0],
        expectedVersion: 1,
        locale: "ko",
        question: "학교에서 자주 볼 수 있나요?",
      };
      const required = await applyQuestionGameRunAction(
        "student-1",
        "run-1",
        input,
      );
      expect(isMysteryQuestionResolutionRequired(required)).toBe(true);
      if (!isMysteryQuestionResolutionRequired(required)) return;
      expect(required.resolution).toMatchObject({
        runId: "run-1",
        requestId: MYSTERY_ACTION_IDS[0],
        expectedVersion: 1,
      });
      const resolution = {
        ...required.resolution,
        runId: "run-1",
        requestId: MYSTERY_ACTION_IDS[0],
        expectedVersion: 1,
        answer: "yes" as const,
        [field]: changedValue,
      };

      await expect(applyQuestionGameRunAction(
        "student-1",
        "run-1",
        input,
        new Date(),
        resolution,
      )).rejects.toMatchObject({ status: 409 });
      expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 1 });
      expect(activities).toHaveLength(0);
      expect(pointLogs).toHaveLength(0);
    },
  );

  it("같은 규칙 밖 질문이 동시에 들어오면 한 활동만 기록하고 나머지는 저장 응답을 재생한다", async () => {
    await createMystery();
    mocks.generateJson.mockResolvedValue({ answer: "yes" });

    const responses = await Promise.all([
      submitMysteryQuestion(0, 1, "학교에서 자주 볼 수 있나요?"),
      submitMysteryQuestion(0, 1, "학교에서 자주 볼 수 있나요?"),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(bodies.map((body) => body.replayed).sort()).toEqual([false, true]);
    expect(activities).toHaveLength(1);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 2 });
    expect(pointLogs).toHaveLength(0);
  });

  it("인공지능 차례는 외부 모델과 클라이언트 선택값 없이 공개 단서로 결정한다", async () => {
    await createMystery("ai");
    await submitMysteryQuestion(0, 1, "살아 있나요?");
    const response = await runMysteryAiTurn(1, 2, {
      itemId: "apple",
      question: "내가 고른 질문인가요?",
      guess: "apple",
      correct: true,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      run: {
        version: 3,
        questionCount: 2,
        aiTurnCount: 1,
        mysteryNextStep: "STUDENT_ACTION",
        mysteryHistory: [
          { actor: "STUDENT", kind: "QUESTION" },
          { actor: "AI" },
        ],
        mysteryAnswerItemId: null,
      },
    });
    expect(mocks.generateJson).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("내가 고른 질문인가요?");
    expect(JSON.stringify(activities.at(-1)?.payload)).not.toMatch(
      /itemId|attribute|classification|private/u,
    );
  });

  it.each([
    ["solo", 3, 30],
    ["ai", 5, 50],
  ] as const)(
    "%s 모드는 학생 질문만 점수로 삼고 정답 추측에서 즉시 정산한다",
    async (mode, awarded, dailyLimit) => {
      await createMystery(mode);
      const premature = await postComplete({ requestId: COMPLETE_ID, expectedVersion: 1 });
      expect(premature.status).toBe(409);
      await submitMysteryQuestion(0, 1, "살아 있나요?");
      let version = 2;
      let actionIndex = 1;
      if (mode === "ai") {
        await runMysteryAiTurn(actionIndex, version);
        version += 1;
        actionIndex += 1;
      }
      const secret = mysterySecret();
      const final = await submitMysteryGuess(
        actionIndex,
        version,
        secret.names.ko,
      );

      expect(final.status).toBe(200);
      await expect(final.json()).resolves.toMatchObject({
        run: {
          status: "SETTLED",
          version: version + 1,
          mysteryNextStep: "COMPLETE",
          mysteryWinner: "STUDENT",
          mysteryEndReason: "SOLVED",
          mysteryAnswerItemId: secret.id,
          mysteryStudentQuestionCount: 1,
        },
        result: { awarded, dailyLimit, preview: false },
      });
      expect(activities.reduce(
        (sum, activity) => sum + activity.validQuestionCount,
        0,
      )).toBe(1);
      expect(pointLogs).toHaveLength(1);
      expect(users.get("student-1")?.totalPoints).toBe(awarded);

      const completed = await postComplete({
        requestId: COMPLETE_ID,
        expectedVersion: version + 1,
      });
      expect(completed.status).toBe(200);
      await expect(completed.json()).resolves.toMatchObject({
        result: { awarded, alreadySettled: true },
        replayed: true,
      });
    },
  );

  it("인공지능은 공개 단서 계획으로 정답을 맞히고 학생 질문만 점수로 계산한다", async () => {
    await createMystery("ai");
    let version = 1;
    let actionIndex = 0;
    let studentQuestionCount = 0;
    let finalBody: Record<string, unknown> | undefined;

    for (let turn = 0; turn < 20; turn += 1) {
      const state = storedMysteryState();
      let response: Response;
      if (state.mysteryNextStep === "STUDENT_ACTION") {
        const usedAttributes = new Set(state.history.flatMap((activity) =>
          typeof activity.attribute === "string" ? [activity.attribute] : []
        ));
        const attribute = MYSTERY_ATTRIBUTES.find((candidate) =>
          !usedAttributes.has(candidate)
        );
        if (attribute) {
          response = await submitMysteryQuestion(
            actionIndex,
            version,
            mysteryQuestionForAttribute(attribute, "ko"),
          );
          studentQuestionCount += 1;
        } else {
          response = await submitMysteryGuess(
            actionIndex,
            version,
            `정답이 아닌 추측 ${turn + 1}`,
          );
        }
      } else {
        response = await runMysteryAiTurn(actionIndex, version);
      }
      expect(response.status).toBe(200);
      const body = await response.json() as {
        run: { status: string; version: number };
        [key: string]: unknown;
      };
      version = body.run.version;
      actionIndex += 1;
      if (body.run.status === "SETTLED") {
        finalBody = body;
        break;
      }
    }

    expect(finalBody).toMatchObject({
      run: {
        status: "SETTLED",
        mysteryNextStep: "COMPLETE",
        mysteryWinner: "AI",
        mysteryEndReason: "SOLVED",
        mysteryAnswerItemId: mysterySecret().id,
        mysteryStudentQuestionCount: studentQuestionCount,
      },
      result: {
        awarded: studentQuestionCount * 2 + 3,
        dailyLimit: 50,
      },
    });
    expect(activities.at(-1)).toMatchObject({
      type: "MYSTERY_AI_ACTIVITY",
      validQuestionCount: 0,
      scoreValue: studentQuestionCount * 2 + 3,
    });
    expect(activities.reduce(
      (sum, activity) => sum + activity.validQuestionCount,
      0,
    )).toBe(studentQuestionCount);
    expect(users.get("student-1")?.totalPoints).toBe(studentQuestionCount * 2 + 3);
  });

  it("스무 번째 전체 활동에서 제한 종료하고 정산 뒤에만 정답을 공개한다", async () => {
    await createMystery();
    let final: Response | undefined;
    for (let index = 0; index < 20; index += 1) {
      final = await submitMysteryQuestion(
        index,
        index + 1,
        `먹을 수 있나요 ${index + 1}?`,
      );
      if (index < 19) {
        await expect(final.json()).resolves.toMatchObject({
          run: { mysteryAnswerItemId: null, status: "ACTIVE" },
        });
      }
    }
    if (!final) throw new Error("missing final mystery response");
    const secret = mysterySecret();

    expect(final.status).toBe(200);
    await expect(final.json()).resolves.toMatchObject({
      run: {
        status: "SETTLED",
        version: 21,
        questionCount: 20,
        mysteryEndReason: "LIMIT",
        mysteryWinner: null,
        mysteryAnswerItemId: secret.id,
      },
      result: { awarded: 22 },
    });
    expect(activities).toHaveLength(20);
    expect(pointLogs).toHaveLength(1);
  });

  it("마지막 활동 근거가 빠지면 정산과 점수를 거절한다", async () => {
    await createMystery();
    await submitMysteryQuestion(0, 1, "살아 있나요?");
    activities.splice(0, 1);
    const secret = mysterySecret();

    const response = await submitMysteryGuess(1, 2, secret.names.ko);

    expect(response.status).toBe(409);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 2 });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it("활동 판정 근거가 바뀌면 상태 기록과 맞더라도 정산하지 않는다", async () => {
    await createMystery();
    await submitMysteryQuestion(0, 1, "살아 있나요?");
    const payload = activities[0]?.payload as { answer?: string } | undefined;
    if (!payload || (payload.answer !== "yes" && payload.answer !== "no")) {
      throw new Error("missing mystery evidence");
    }
    payload.answer = payload.answer === "yes" ? "no" : "yes";

    const response = await submitMysteryGuess(1, 2, mysterySecret().names.ko);

    expect(response.status).toBe(409);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 2 });
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);
  });

  it("동시 마지막 추측은 한 건만 정산한다", async () => {
    await createMystery();
    await submitMysteryQuestion(0, 1, "살아 있나요?");
    const secret = mysterySecret();

    const responses = await Promise.all([
      submitMysteryGuess(1, 2, secret.names.ko),
      submitMysteryGuess(
        1,
        2,
        secret.names.ko,
        "ko",
        "run-1",
        MYSTERY_ALTERNATE_FINAL_ACTION_ID,
      ),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(pointLogs).toHaveLength(1);
    expect(activities).toHaveLength(2);
    expect(users.get("student-1")?.totalPoints).toBe(3);
  });

  it("마지막 활동 저장 실패는 실행과 점수를 되돌리고 같은 요청으로 재시도한다", async () => {
    await createMystery();
    await submitMysteryQuestion(0, 1, "살아 있나요?");
    const secret = mysterySecret();
    mocks.activityCreate.mockRejectedValueOnce(new Error("private-mystery-storage"));

    const failed = await submitMysteryGuess(1, 2, secret.names.ko);

    expect(failed.status).toBe(500);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 2 });
    expect(activities).toHaveLength(1);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);

    const retry = await submitMysteryGuess(1, 2, secret.names.ko);
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({ result: { awarded: 3 } });
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(3);
  });

  it("스무 번째 외부 판정 활동 저장 실패는 실행과 점수를 모두 되돌리고 같은 요청으로 제한 정산한다", async () => {
    await createMystery();
    for (let index = 0; index < 19; index += 1) {
      const response = await submitMysteryQuestion(
        index,
        index + 1,
        `먹을 수 있나요 ${index + 1}?`,
      );
      expect(response.status).toBe(200);
    }
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 20 });
    expect(activities).toHaveLength(19);
    mocks.activityCreate.mockRejectedValueOnce(new Error("private-last-mystery-storage"));

    const failed = await submitMysteryQuestion(
      19,
      20,
      "학교에서 자주 볼 수 있나요?",
    );

    expect(failed.status).toBe(500);
    expect(runs.get("run-1")).toMatchObject({ status: "ACTIVE", version: 20 });
    expect(storedMysteryState()).toMatchObject({
      questionCount: 19,
      mysteryNextStep: "STUDENT_ACTION",
    });
    expect(activities).toHaveLength(19);
    expect(pointLogs).toHaveLength(0);
    expect(users.get("student-1")?.totalPoints).toBe(0);

    const retry = await submitMysteryQuestion(
      19,
      20,
      "학교에서 자주 볼 수 있나요?",
    );
    expect(retry.status).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      run: {
        status: "SETTLED",
        version: 21,
        mysteryEndReason: "LIMIT",
        mysteryAnswerItemId: mysterySecret().id,
        mysteryStudentQuestionCount: 20,
      },
      result: { awarded: 22 },
    });
    expect(activities).toHaveLength(20);
    expect(pointLogs).toHaveLength(1);
    expect(users.get("student-1")?.totalPoints).toBe(22);
    expect(mocks.generateJson).toHaveBeenCalledTimes(2);
  });

  it("교사와 하루 상한 및 만료와 자동 포기를 공통 정책으로 처리한다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "teacher-1", role: "TEACHER" } });
    await createMystery();
    await submitMysteryQuestion(0, 1, "살아 있나요?");
    const teacherFinal = await submitMysteryGuess(1, 2, mysterySecret().names.ko);
    await expect(teacherFinal.json()).resolves.toMatchObject({
      result: { awarded: 0, preview: true },
      run: { preview: true, mysteryAnswerItemId: expect.any(String) },
    });
    expect(pointLogs).toHaveLength(0);

    mocks.auth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    runs.clear();
    activities.splice(0);
    pointLogs.push({
      studentId: "student-1",
      gameId: "ACTIVITY_SOLO",
      gameRunId: "old-run",
      bonusType: "ACTIVITY_SOLO_relay",
      points: 29,
      reason: "이전 실행",
      status: "APPROVED",
      createdAt: new Date(),
    });
    await createMystery();
    await submitMysteryQuestion(0, 1, "살아 있나요?");
    const capped = await submitMysteryGuess(1, 2, mysterySecret().names.ko);
    await expect(capped.json()).resolves.toMatchObject({
      result: { awarded: 1, dailyRemaining: 0, cappedByLimit: true },
    });

    runs.clear();
    activities.splice(0);
    pointLogs.splice(0);
    await createMystery();
    const expiring = runs.get("run-1");
    if (!expiring) throw new Error("missing expiring mystery run");
    expiring.expiresAt = new Date(0);
    const expired = await readResult();
    await expect(expired.json()).resolves.toMatchObject({
      run: {
        status: "EXPIRED",
        version: 2,
        mysteryNextStep: "STUDENT_ACTION",
        mysteryAnswerItemId: null,
      },
      result: null,
    });

    runs.clear();
    activities.splice(0);
    for (const requestId of [CREATE_ID, SECOND_CREATE_ID, THIRD_CREATE_ID, FOURTH_CREATE_ID]) {
      await postCreate({
        gameId: "mystery-box",
        mode: "solo",
        locale: "ko",
        requestId,
      });
    }
    const abandonedReplay = await createMystery();
    await expect(abandonedReplay.json()).resolves.toMatchObject({
      replayed: true,
      run: {
        id: "run-1",
        status: "ABANDONED",
        version: 2,
        mysteryAnswerItemId: null,
      },
    });
    expect([...runs.values()].filter((run) => run.status === "ACTIVE")).toHaveLength(3);
  });
});
