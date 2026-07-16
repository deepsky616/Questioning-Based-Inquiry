import { randomInt } from "node:crypto";
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
import {
  STORY_DICE_FALLBACK,
  STORY_DICE_FALLBACK_EN,
  type DiceCategory,
} from "@/lib/story-dice-data";
import { QUESTION_GAME_RULES } from "@/lib/question-game-rules";

export type StoryDiceNextStep =
  | "ROLL"
  | "STORY"
  | "STUDENT_QUESTION"
  | "AI_QUESTION"
  | "STUDENT_ANSWER"
  | "COMPLETE";

export type StoryDiceWordPlan = Record<DiceCategory, string[]>;
export type StoryDiceRolledWords = Record<DiceCategory, string>;

export interface StoryDiceRunState {
  game: "story-dice";
  locale: "ko" | "en";
  targetCount: 3;
  questionCount: number;
  aiTurnCount: number;
  activitySequence: number;
  storyDiceNextStep: StoryDiceNextStep;
  wordPlan: StoryDiceWordPlan;
  rolledWords?: StoryDiceRolledWords;
  storyHash?: string;
  storyLength?: number;
  pendingQuestionHash?: string;
  questionHashes: string[];
  answerHashes: string[];
  aiGenerationLease?: QuestionGameAiGenerationLease;
  result?: QuestionGameRunResult;
}

const CATEGORIES: DiceCategory[] = ["protagonist", "place", "event"];
const CATEGORY_PREFIX: Record<DiceCategory, string> = {
  protagonist: "p",
  place: "l",
  event: "e",
};
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const WORD_KEY_PATTERN = /^story-(p|l|e)-(0[1-9]|1[0-9]|2[0-4])$/;

interface StoryDiceWordEntry {
  key: string;
  category: DiceCategory;
  ko: string;
  en: string;
}

const WORD_ENTRIES: StoryDiceWordEntry[] = CATEGORIES.flatMap((category) =>
  STORY_DICE_FALLBACK[category].map((ko, index) => ({
    key: `story-${CATEGORY_PREFIX[category]}-${String(index + 1).padStart(2, "0")}`,
    category,
    ko,
    en: STORY_DICE_FALLBACK_EN[category][index] ?? ko,
  })),
);
const WORD_BY_KEY = new Map(WORD_ENTRIES.map((entry) => [entry.key, entry]));
const WORD_KEYS_BY_CATEGORY = Object.fromEntries(CATEGORIES.map((category) => [
  category,
  WORD_ENTRIES.filter((entry) => entry.category === category).map((entry) => entry.key),
])) as Record<DiceCategory, string[]>;

type RandomIndex = (upperExclusive: number) => number;

function secureRandomIndex(upperExclusive: number): number {
  return randomInt(0, upperExclusive);
}

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

function isWordKeyForCategory(value: unknown, category: DiceCategory): value is string {
  if (typeof value !== "string" || !WORD_KEY_PATTERN.test(value)) return false;
  return WORD_BY_KEY.get(value)?.category === category;
}

function parseWordPlan(value: unknown): StoryDiceWordPlan {
  if (!isQuestionGameRunRecord(value)) damaged();
  const plan = {} as StoryDiceWordPlan;
  for (const category of CATEGORIES) {
    const words = value[category];
    if (
      !isDenseArray(words) ||
      words.length !== 8 ||
      !words.every((word) => isWordKeyForCategory(word, category))
    ) damaged();
    const copied = [...words] as string[];
    if (new Set(copied).size !== copied.length) damaged();
    plan[category] = copied;
  }
  return plan;
}

function parseRolledWords(
  value: unknown,
  wordPlan: StoryDiceWordPlan,
): StoryDiceRolledWords | undefined {
  if (value === undefined) return undefined;
  if (!isQuestionGameRunRecord(value)) damaged();
  const rolled = {} as StoryDiceRolledWords;
  for (const category of CATEGORIES) {
    const word = value[category];
    if (!isWordKeyForCategory(word, category) || !wordPlan[category].includes(word)) damaged();
    rolled[category] = word;
  }
  return rolled;
}

function parseHashes(value: unknown): string[] {
  if (!isDenseArray(value) || !value.every((item) =>
    typeof item === "string" && HASH_PATTERN.test(item)
  )) damaged();
  return [...value] as string[];
}

function optionalHash(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) damaged();
  return value;
}

function optionalLength(value: unknown, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) damaged();
  return value as number;
}

export function storyDiceWordText(
  key: string,
  locale: "ko" | "en",
): string {
  const entry = WORD_BY_KEY.get(key);
  if (!entry) damaged();
  return entry[locale];
}

export function storyDicePublicWordPlan(
  wordPlan: StoryDiceWordPlan,
  locale: "ko" | "en",
) {
  return Object.fromEntries(CATEGORIES.map((category) => [
    category,
    wordPlan[category].map((key) => storyDiceWordText(key, locale)),
  ])) as Record<DiceCategory, string[]>;
}

export function storyDicePublicRolledWords(
  rolledWords: StoryDiceRolledWords,
  locale: "ko" | "en",
) {
  return Object.fromEntries(CATEGORIES.map((category) => [
    category,
    storyDiceWordText(rolledWords[category], locale),
  ])) as Record<DiceCategory, string>;
}

export function createStoryDiceRoll(
  wordPlan: StoryDiceWordPlan,
  randomIndex: RandomIndex = secureRandomIndex,
): StoryDiceRolledWords {
  const rolled = {} as StoryDiceRolledWords;
  for (const category of CATEGORIES) {
    const words = wordPlan[category];
    const index = randomIndex(words.length);
    if (!Number.isSafeInteger(index) || index < 0 || index >= words.length) {
      throw new QuestionGameRunError("이야기 주사위 결과를 만들 수 없습니다", 500);
    }
    rolled[category] = words[index];
  }
  return rolled;
}

export function parseStoryDiceState(value: Prisma.JsonValue): StoryDiceRunState {
  if (!isQuestionGameRunRecord(value)) damaged();
  const wordPlan = parseWordPlan(value.wordPlan);
  const rolledWords = parseRolledWords(value.rolledWords, wordPlan);
  const storyHash = optionalHash(value.storyHash);
  const storyLength = optionalLength(value.storyLength, 500);
  const pendingQuestionHash = optionalHash(value.pendingQuestionHash);
  const questionHashes = parseHashes(value.questionHashes);
  const answerHashes = parseHashes(value.answerHashes);
  const aiGenerationLease = parseQuestionGameAiGenerationLease(value.aiGenerationLease);
  const result = parseQuestionGameRunResult(value.result);
  if (
    value.game !== "story-dice" ||
    (value.locale !== "ko" && value.locale !== "en") ||
    value.targetCount !== QUESTION_GAME_RULES["story-dice"].targets.solo.count ||
    typeof value.questionCount !== "number" ||
    !Number.isSafeInteger(value.questionCount) ||
    value.questionCount < 0 ||
    value.questionCount > QUESTION_GAME_RULES["story-dice"].targets.solo.count ||
    typeof value.aiTurnCount !== "number" ||
    !Number.isSafeInteger(value.aiTurnCount) ||
    value.aiTurnCount < 0 ||
    value.aiTurnCount > QUESTION_GAME_RULES["story-dice"].targets.ai.count ||
    typeof value.activitySequence !== "number" ||
    !Number.isSafeInteger(value.activitySequence) ||
    value.activitySequence < 0 ||
    (value.storyDiceNextStep !== "ROLL" &&
      value.storyDiceNextStep !== "STORY" &&
      value.storyDiceNextStep !== "STUDENT_QUESTION" &&
      value.storyDiceNextStep !== "AI_QUESTION" &&
      value.storyDiceNextStep !== "STUDENT_ANSWER" &&
      value.storyDiceNextStep !== "COMPLETE") ||
    (storyHash === undefined) !== (storyLength === undefined) ||
    (result !== undefined && (questionHashes.length !== 0 || answerHashes.length !== 0))
  ) damaged();
  return {
    game: "story-dice",
    locale: value.locale,
    targetCount: QUESTION_GAME_RULES["story-dice"].targets.solo.count,
    questionCount: value.questionCount,
    aiTurnCount: value.aiTurnCount,
    activitySequence: value.activitySequence,
    storyDiceNextStep: value.storyDiceNextStep,
    wordPlan,
    ...(rolledWords ? { rolledWords } : {}),
    ...(storyHash ? { storyHash } : {}),
    ...(storyLength ? { storyLength } : {}),
    ...(pendingQuestionHash ? { pendingQuestionHash } : {}),
    questionHashes,
    answerHashes,
    ...(aiGenerationLease ? { aiGenerationLease } : {}),
    ...(result ? { result } : {}),
  };
}

export function ensureStoryDiceProgress(
  state: StoryDiceRunState,
  mode: QuestionGameRunMode,
  runVersion: number,
  activeRun = true,
) {
  const settled = state.result !== undefined;
  const expectedRunVersion = state.activitySequence + 1 + (
    !activeRun && !settled ? 1 : 0
  );
  const storyStarted = state.storyDiceNextStep !== "ROLL" &&
    state.storyDiceNextStep !== "STORY";
  const hashesCleared = settled && state.storyDiceNextStep === "COMPLETE";
  const expectedQuestionHashCount = hashesCleared
    ? 0
    : state.questionCount + (state.storyDiceNextStep === "STUDENT_ANSWER" ? 1 : 0);
  const expectedAnswerHashCount = hashesCleared ? 0 : state.questionCount;
  const expectedAiTurnCount = mode === "AI"
    ? state.questionCount + (state.storyDiceNextStep === "STUDENT_ANSWER" ? 1 : 0)
    : 0;
  const expectedSequence = state.storyDiceNextStep === "ROLL"
    ? 0
    : state.storyDiceNextStep === "STORY"
      ? 1
      : 2 + 2 * state.questionCount + (
          state.storyDiceNextStep === "STUDENT_ANSWER" ? 1 : 0
        );
  const expectedQuestionStep = mode === "AI" ? "AI_QUESTION" : "STUDENT_QUESTION";

  if (
    runVersion !== expectedRunVersion ||
    state.activitySequence !== expectedSequence ||
    state.aiTurnCount !== expectedAiTurnCount ||
    state.questionHashes.length !== expectedQuestionHashCount ||
    state.answerHashes.length !== expectedAnswerHashCount ||
    new Set(state.questionHashes).size !== state.questionHashes.length ||
    (state.rolledWords !== undefined) === (state.storyDiceNextStep === "ROLL") ||
    (state.storyHash !== undefined) !== (storyStarted && !settled) ||
    (state.storyLength !== undefined) !== (storyStarted && !settled) ||
    (state.pendingQuestionHash !== undefined) !==
      (state.storyDiceNextStep === "STUDENT_ANSWER") ||
    (state.pendingQuestionHash !== undefined &&
      state.pendingQuestionHash !== state.questionHashes.at(-1)) ||
    (state.storyDiceNextStep === "STUDENT_QUESTION" && mode !== "SOLO") ||
    (state.storyDiceNextStep === "AI_QUESTION" && mode !== "AI") ||
    ((state.storyDiceNextStep === "STUDENT_QUESTION" ||
      state.storyDiceNextStep === "AI_QUESTION") &&
      (state.questionCount >= state.targetCount || state.storyDiceNextStep !== expectedQuestionStep)) ||
    (state.storyDiceNextStep === "STUDENT_ANSWER" &&
      state.questionCount >= state.targetCount) ||
    (state.storyDiceNextStep === "COMPLETE" && state.questionCount !== state.targetCount) ||
    (state.storyDiceNextStep !== "COMPLETE" && state.questionCount === state.targetCount) ||
    (activeRun && settled) ||
    (settled && state.storyDiceNextStep !== "COMPLETE") ||
    (state.aiGenerationLease !== undefined &&
      (mode !== "AI" ||
        state.storyDiceNextStep !== "AI_QUESTION" ||
        (activeRun && state.aiGenerationLease.runVersion !== runVersion)))
  ) damaged();
}

export function createStoryDiceState(
  input: QuestionGameRunCreateStateInput,
  randomIndex: RandomIndex = secureRandomIndex,
): StoryDiceRunState {
  const wordPlan = {} as StoryDiceWordPlan;
  for (const category of CATEGORIES) {
    const keys = [...WORD_KEYS_BY_CATEGORY[category]];
    for (let index = keys.length - 1; index > 0; index -= 1) {
      const swapIndex = randomIndex(index + 1);
      if (!Number.isSafeInteger(swapIndex) || swapIndex < 0 || swapIndex > index) {
        throw new QuestionGameRunError("이야기 주사위 단어를 준비할 수 없습니다", 500);
      }
      [keys[index], keys[swapIndex]] = [keys[swapIndex], keys[index]];
    }
    wordPlan[category] = keys.slice(0, 8);
  }
  return {
    game: "story-dice",
    locale: input.locale,
    targetCount: QUESTION_GAME_RULES["story-dice"].targets.solo.count,
    questionCount: 0,
    aiTurnCount: 0,
    activitySequence: 0,
    storyDiceNextStep: "ROLL",
    wordPlan,
    questionHashes: [],
    answerHashes: [],
  };
}

function storyDiceState(value: unknown): StoryDiceRunState {
  return parseStoryDiceState(value as Prisma.JsonValue);
}

export const storyDiceRunDefinition: QuestionGameRunDefinition = {
  gameId: "story-dice",
  createState: createStoryDiceState,
  parseState: parseStoryDiceState,
  ensureProgress(state: unknown, context: QuestionGameRunProgressContext) {
    ensureStoryDiceProgress(
      storyDiceState(state),
      context.mode,
      context.runVersion,
      context.activeRun,
    );
  },
  publicProgress(state: unknown, mode: QuestionGameRunMode) {
    const storyDice = storyDiceState(state);
    return {
      questionCount: storyDice.questionCount,
      aiTurnCount: storyDice.aiTurnCount,
      awaitingAiTurn: mode === "AI" && storyDice.storyDiceNextStep === "AI_QUESTION",
      targetCount: storyDice.targetCount,
      storyDiceNextStep: storyDice.storyDiceNextStep,
      storyWordPool: storyDicePublicWordPlan(storyDice.wordPlan, storyDice.locale),
      storyRolledWords: storyDice.rolledWords
        ? storyDicePublicRolledWords(storyDice.rolledWords, storyDice.locale)
        : null,
    };
  },
  clearTransientState(state: unknown) {
    const storyDice = storyDiceState(state);
    const cleared = { ...storyDice };
    delete cleared.aiGenerationLease;
    return cleared;
  },
  result(state: unknown) {
    return storyDiceState(state).result;
  },
};
