import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  isQuestionGameRunRecord,
  parseQuestionGameRunResult,
  QuestionGameRunError,
  type QuestionGameRunCreateStateInput,
  type QuestionGameRunDefinition,
  type QuestionGameRunMode,
  type QuestionGameRunProgressContext,
  type QuestionGameRunResult,
} from "@/lib/question-game-run-definition";
import { QUESTION_GAME_RULES } from "@/lib/question-game-rules";
import { assignLadderTopics, generateLadderGrid, type LadderGrid } from "@/lib/question-ladder";

export type LadderRunNextStep = "QUESTION" | "COMPLETE";

export interface LadderRunState {
  game: "ladder";
  locale: "ko" | "en";
  targetCount: 3;
  questionCount: number;
  aiTurnCount: 0;
  activitySequence: number;
  nextStep: LadderRunNextStep;
  topicHashes: string[];
  grids: boolean[][][];
  questionHashes: string[];
  result?: QuestionGameRunResult;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SOLO_TOPIC_COUNT = 4;
const AI_TOPIC_COUNT = 2;
const RANDOM_RANGE = 0x1_0000_0000;

function damaged(): never {
  throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function parseHashes(value: unknown): string[] {
  if (!isDenseArray(value) || !value.every((item) =>
    typeof item === "string" && HASH_PATTERN.test(item)
  )) damaged();
  return [...value] as string[];
}

function parseGrids(value: unknown, topicHashes: readonly string[]): boolean[][][] {
  if (!isDenseArray(value) || value.length !== 3) damaged();
  const grids: boolean[][][] = [];
  for (const candidate of value) {
    if (!isDenseArray(candidate)) damaged();
    const grid = candidate as boolean[][];
    try {
      assignLadderTopics(topicHashes, grid);
    } catch {
      damaged();
    }
    grids.push(grid.map((row) => [...row]));
  }
  return grids;
}

function secureRandomFraction(): number {
  return randomInt(0, RANDOM_RANGE) / RANDOM_RANGE;
}

export function parseLadderState(value: Prisma.JsonValue): LadderRunState {
  if (!isQuestionGameRunRecord(value)) damaged();
  const topicHashes = parseHashes(value.topicHashes);
  const questionHashes = parseHashes(value.questionHashes);
  if (
    value.game !== "ladder" ||
    (value.locale !== "ko" && value.locale !== "en") ||
    value.targetCount !== QUESTION_GAME_RULES.ladder.targets.solo.count ||
    typeof value.questionCount !== "number" ||
    !Number.isSafeInteger(value.questionCount) ||
    value.questionCount < 0 ||
    value.questionCount > QUESTION_GAME_RULES.ladder.targets.solo.count ||
    value.aiTurnCount !== 0 ||
    typeof value.activitySequence !== "number" ||
    !Number.isSafeInteger(value.activitySequence) ||
    value.activitySequence < 0 ||
    (value.nextStep !== "QUESTION" && value.nextStep !== "COMPLETE") ||
    (topicHashes.length !== SOLO_TOPIC_COUNT && topicHashes.length !== AI_TOPIC_COUNT)
  ) damaged();
  const grids = parseGrids(value.grids, topicHashes);
  const result = parseQuestionGameRunResult(value.result);
  if (questionHashes.length !== (result ? 0 : value.questionCount)) damaged();
  return {
    game: "ladder",
    locale: value.locale,
    targetCount: 3,
    questionCount: value.questionCount,
    aiTurnCount: 0,
    activitySequence: value.activitySequence,
    nextStep: value.nextStep,
    topicHashes,
    grids,
    questionHashes,
    ...(result ? { result } : {}),
  };
}

export function ensureLadderProgress(
  state: LadderRunState,
  mode: QuestionGameRunMode,
  runVersion: number,
  activeRun = true,
) {
  const expectedTopicCount = mode === "SOLO" ? SOLO_TOPIC_COUNT : AI_TOPIC_COUNT;
  const progressVersion = state.questionCount + 1;
  const expectedRunVersion = progressVersion + (
    !activeRun && state.result === undefined ? 1 : 0
  );
  const expectedStep: LadderRunNextStep = state.questionCount === state.targetCount
    ? "COMPLETE"
    : "QUESTION";
  if (
    state.topicHashes.length !== expectedTopicCount ||
    runVersion !== expectedRunVersion ||
    state.activitySequence !== state.questionCount ||
    state.nextStep !== expectedStep ||
    new Set(state.questionHashes).size !== state.questionHashes.length ||
    (activeRun && state.result !== undefined) ||
    (state.result !== undefined && state.nextStep !== "COMPLETE")
  ) damaged();
}

export function createLadderState(
  input: QuestionGameRunCreateStateInput,
  random: () => number = secureRandomFraction,
): LadderRunState {
  const expectedTopicCount = input.mode === "SOLO" ? SOLO_TOPIC_COUNT : AI_TOPIC_COUNT;
  if (
    !input.topicHashes ||
    input.topicHashes.length !== expectedTopicCount ||
    !input.topicHashes.every((hash) => HASH_PATTERN.test(hash))
  ) {
    throw new QuestionGameRunError("질문 사다리 주제 자료가 올바르지 않습니다", 400);
  }
  return {
    game: "ladder",
    locale: input.locale,
    targetCount: 3,
    questionCount: 0,
    aiTurnCount: 0,
    activitySequence: 0,
    nextStep: "QUESTION",
    topicHashes: [...input.topicHashes],
    grids: Array.from(
      { length: 3 },
      () => generateLadderGrid(expectedTopicCount, random),
    ),
    questionHashes: [],
  };
}

function ladderState(value: unknown): LadderRunState {
  return parseLadderState(value as Prisma.JsonValue);
}

export function ladderDestination(startColumn: number, grid: LadderGrid): number {
  const assignments = assignLadderTopics(
    Array.from({ length: grid[0]?.length + 1 }, (_, index) => String(index)),
    grid,
  );
  const assignment = assignments[startColumn];
  if (!assignment) {
    throw new QuestionGameRunError("질문 사다리 시작점이 올바르지 않습니다", 400);
  }
  return assignment.destinationColumn;
}

export const ladderRunDefinition: QuestionGameRunDefinition = {
  gameId: "ladder",
  createState: createLadderState,
  parseState: parseLadderState,
  ensureProgress(state: unknown, context: QuestionGameRunProgressContext) {
    ensureLadderProgress(
      ladderState(state),
      context.mode,
      context.runVersion,
      context.activeRun,
    );
  },
  publicProgress(state: unknown) {
    const ladder = ladderState(state);
    const complete = ladder.nextStep === "COMPLETE";
    const ladderRound = complete
      ? null
      : (ladder.questionCount + 1) as 1 | 2 | 3;
    return {
      questionCount: ladder.questionCount,
      aiTurnCount: 0,
      awaitingAiTurn: false,
      targetCount: ladder.targetCount,
      ladderRound,
      ladderGrid: complete ? null : ladder.grids[ladder.questionCount],
    };
  },
  clearTransientState(state: unknown) {
    return ladderState(state);
  },
  result(state: unknown) {
    return ladderState(state).result;
  },
};
