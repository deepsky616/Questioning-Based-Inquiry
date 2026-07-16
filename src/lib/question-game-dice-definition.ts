import type { Prisma } from "@prisma/client";
import {
  isQuestionGameRunRecord,
  parseQuestionGameAiGenerationLease,
  parseQuestionGameRunResult,
  QuestionGameRunError,
  type QuestionGameAiGenerationLease,
  type QuestionGameRunCreateStateInput,
  type QuestionGameRunDefinition,
  type QuestionGameRunMode,
  type QuestionGameRunProgressContext,
  type QuestionGameRunResult,
} from "@/lib/question-game-run-definition";
import { QUESTION_GAME_RULES } from "@/lib/question-game-rules";

export type DiceActor = "STUDENT" | "AI";
export type DiceNextStep =
  | "STUDENT_ROLL"
  | "STUDENT_QUESTION"
  | "AI_ROLL"
  | "AI_QUESTION"
  | "COMPLETE";

export interface DicePendingRoll {
  actor: DiceActor;
  face: number;
}

export interface DiceRunState {
  game: "dice";
  locale: "ko" | "en";
  targetCount: number;
  questionCount: number;
  aiTurnCount: number;
  activitySequence: number;
  nextStep: DiceNextStep;
  pendingRoll?: DicePendingRoll;
  questionHashes: string[];
  aiGenerationLease?: QuestionGameAiGenerationLease;
  result?: QuestionGameRunResult;
}

function parsePendingRoll(value: unknown): DicePendingRoll | undefined {
  if (value === undefined) return undefined;
  if (
    !isQuestionGameRunRecord(value) ||
    (value.actor !== "STUDENT" && value.actor !== "AI") ||
    typeof value.face !== "number" ||
    !Number.isSafeInteger(value.face) ||
    value.face < 1 ||
    value.face > 6
  ) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  return { actor: value.actor, face: value.face };
}

export function parseDiceState(value: Prisma.JsonValue): DiceRunState {
  if (!isQuestionGameRunRecord(value)) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  const questionHashes = value.questionHashes;
  if (
    value.game !== "dice" ||
    (value.locale !== "ko" && value.locale !== "en") ||
    value.targetCount !== QUESTION_GAME_RULES.dice.targets.solo.count ||
    typeof value.questionCount !== "number" ||
    !Number.isSafeInteger(value.questionCount) ||
    value.questionCount < 0 ||
    value.questionCount > QUESTION_GAME_RULES.dice.targets.solo.count ||
    typeof value.aiTurnCount !== "number" ||
    !Number.isSafeInteger(value.aiTurnCount) ||
    value.aiTurnCount < 0 ||
    value.aiTurnCount > QUESTION_GAME_RULES.dice.targets.ai.count - 1 ||
    typeof value.activitySequence !== "number" ||
    !Number.isSafeInteger(value.activitySequence) ||
    value.activitySequence < 0 ||
    (value.nextStep !== "STUDENT_ROLL" &&
      value.nextStep !== "STUDENT_QUESTION" &&
      value.nextStep !== "AI_ROLL" &&
      value.nextStep !== "AI_QUESTION" &&
      value.nextStep !== "COMPLETE") ||
    !Array.isArray(questionHashes) ||
    !questionHashes.every(
      (item): item is string => typeof item === "string" && /^[0-9a-f]{64}$/.test(item),
    )
  ) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  const pendingRoll = parsePendingRoll(value.pendingRoll);
  const aiGenerationLease = parseQuestionGameAiGenerationLease(value.aiGenerationLease);
  const result = parseQuestionGameRunResult(value.result);
  if (questionHashes.length !== (result ? 0 : value.questionCount)) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
  return {
    game: "dice",
    locale: value.locale,
    targetCount: value.targetCount,
    questionCount: value.questionCount,
    aiTurnCount: value.aiTurnCount,
    activitySequence: value.activitySequence,
    nextStep: value.nextStep,
    ...(pendingRoll ? { pendingRoll } : {}),
    questionHashes,
    ...(aiGenerationLease ? { aiGenerationLease } : {}),
    ...(result ? { result } : {}),
  };
}

export function ensureDiceProgress(
  state: DiceRunState,
  mode: QuestionGameRunMode,
  runVersion: number,
  activeRun = true,
) {
  const pendingActor = state.pendingRoll?.actor;
  const pendingSequence = state.pendingRoll ? 1 : 0;
  if (
    state.activitySequence !== 2 * (state.questionCount + state.aiTurnCount) + pendingSequence ||
    (state.nextStep === "STUDENT_QUESTION" && pendingActor !== "STUDENT") ||
    (state.nextStep === "AI_QUESTION" && pendingActor !== "AI") ||
    ((state.nextStep === "STUDENT_ROLL" ||
      state.nextStep === "AI_ROLL" ||
      state.nextStep === "COMPLETE") && state.pendingRoll !== undefined) ||
    (state.aiGenerationLease !== undefined &&
      (mode !== "AI" ||
        state.nextStep !== "AI_QUESTION" ||
        pendingActor !== "AI" ||
        (activeRun && state.aiGenerationLease.runVersion !== runVersion))) ||
    (state.result !== undefined && state.nextStep !== "COMPLETE")
  ) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }

  let expectedStep: DiceNextStep;
  if (mode === "SOLO") {
    if (state.aiTurnCount !== 0) {
      throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
    }
    if (state.questionCount === state.targetCount) {
      expectedStep = "COMPLETE";
    } else {
      expectedStep = state.pendingRoll ? "STUDENT_QUESTION" : "STUDENT_ROLL";
    }
  } else if (
    state.questionCount === state.targetCount &&
    state.aiTurnCount === state.targetCount - 1
  ) {
    expectedStep = "COMPLETE";
  } else if (state.questionCount === state.aiTurnCount) {
    expectedStep = state.pendingRoll ? "STUDENT_QUESTION" : "STUDENT_ROLL";
  } else if (
    state.questionCount === state.aiTurnCount + 1 &&
    state.questionCount < state.targetCount
  ) {
    expectedStep = state.pendingRoll ? "AI_QUESTION" : "AI_ROLL";
  } else {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }

  if (state.nextStep !== expectedStep) {
    throw new QuestionGameRunError("질문놀이 실행 상태가 손상되었습니다", 409);
  }
}

export function createDiceState(input: QuestionGameRunCreateStateInput): DiceRunState {
  return {
    game: "dice",
    locale: input.locale,
    targetCount: QUESTION_GAME_RULES.dice.targets.solo.count,
    questionCount: 0,
    aiTurnCount: 0,
    activitySequence: 0,
    nextStep: "STUDENT_ROLL",
    questionHashes: [],
  };
}

function diceState(value: unknown): DiceRunState {
  return parseDiceState(value as Prisma.JsonValue);
}

export const diceRunDefinition: QuestionGameRunDefinition = {
  gameId: "dice",
  createState: createDiceState,
  parseState: parseDiceState,
  ensureProgress(state: unknown, context: QuestionGameRunProgressContext) {
    ensureDiceProgress(
      diceState(state),
      context.mode,
      context.runVersion,
      context.activeRun,
    );
  },
  publicProgress(state: unknown, mode: QuestionGameRunMode) {
    const dice = diceState(state);
    return {
      questionCount: dice.questionCount,
      aiTurnCount: dice.aiTurnCount,
      awaitingAiTurn: mode === "AI" && dice.nextStep === "AI_QUESTION",
      targetCount: dice.targetCount,
      nextStep: dice.nextStep,
      pendingRoll: dice.pendingRoll ?? null,
    };
  },
  clearTransientState(state: unknown) {
    const dice = diceState(state);
    const cleared = { ...dice };
    delete cleared.aiGenerationLease;
    return cleared;
  },
  result(state: unknown) {
    return diceState(state).result;
  },
};
