import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  isQuestionGameRunRecord,
  parseQuestionGameRunResult,
  QuestionGameRunError,
  type QuestionGameRunCreateStateInput,
  type QuestionGameRunDefinition,
  type QuestionGameRunProgressContext,
  type QuestionGameRunResult,
} from "@/lib/question-game-run-definition";
import { KABA_SENTENCES } from "@/lib/question-game-i18n";
import { QUESTION_GAME_RULES } from "@/lib/question-game-rules";

export type KabaRunNextStep = "STUDENT_ATTEMPT" | "COMPLETE";

export interface KabaRunState {
  game: "kaba";
  locale: "ko" | "en";
  targetCount: 10;
  questionCount: number;
  correctCount: number;
  aiTurnCount: 0;
  activitySequence: number;
  kabaNextStep: KabaRunNextStep;
  sentencePlan: string[];
  questionHashes: string[];
  result?: QuestionGameRunResult;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SENTENCE_KEY_PATTERN = /^kaba-(?:0[1-9]|1[0-9]|2[0-5])$/;
const SENTENCE_ENTRIES = KABA_SENTENCES.ko.map((ko, index) => ({
  key: `kaba-${String(index + 1).padStart(2, "0")}`,
  ko,
  en: KABA_SENTENCES.en[index] ?? ko,
}));
const SENTENCE_BY_KEY = new Map(SENTENCE_ENTRIES.map((entry) => [entry.key, entry]));

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

function parseSentencePlan(value: unknown): string[] {
  if (
    !isDenseArray(value) ||
    value.length !== QUESTION_GAME_RULES.kaba.targets.solo.count ||
    !value.every((item) =>
      typeof item === "string" &&
      SENTENCE_KEY_PATTERN.test(item) &&
      SENTENCE_BY_KEY.has(item)
    )
  ) damaged();
  const sentencePlan = [...value] as string[];
  if (new Set(sentencePlan).size !== sentencePlan.length) damaged();
  return sentencePlan;
}

function parseQuestionHashes(value: unknown): string[] {
  if (!isDenseArray(value) || !value.every((item) =>
    typeof item === "string" && HASH_PATTERN.test(item)
  )) damaged();
  return [...value] as string[];
}

export function kabaSentenceText(
  key: string,
  locale: "ko" | "en",
): string {
  const sentence = SENTENCE_BY_KEY.get(key);
  if (!sentence) damaged();
  return sentence[locale];
}

export function parseKabaState(value: Prisma.JsonValue): KabaRunState {
  if (!isQuestionGameRunRecord(value)) damaged();
  const sentencePlan = parseSentencePlan(value.sentencePlan);
  const questionHashes = parseQuestionHashes(value.questionHashes);
  if (
    value.game !== "kaba" ||
    (value.locale !== "ko" && value.locale !== "en") ||
    value.targetCount !== QUESTION_GAME_RULES.kaba.targets.solo.count ||
    typeof value.questionCount !== "number" ||
    !Number.isSafeInteger(value.questionCount) ||
    value.questionCount < 0 ||
    value.questionCount > QUESTION_GAME_RULES.kaba.targets.solo.count ||
    typeof value.correctCount !== "number" ||
    !Number.isSafeInteger(value.correctCount) ||
    value.correctCount < 0 ||
    value.correctCount > value.questionCount ||
    value.aiTurnCount !== 0 ||
    typeof value.activitySequence !== "number" ||
    !Number.isSafeInteger(value.activitySequence) ||
    value.activitySequence < 0 ||
    (value.kabaNextStep !== "STUDENT_ATTEMPT" && value.kabaNextStep !== "COMPLETE")
  ) damaged();
  const result = parseQuestionGameRunResult(value.result);
  if (questionHashes.length !== (result ? 0 : value.questionCount)) damaged();
  return {
    game: "kaba",
    locale: value.locale,
    targetCount: QUESTION_GAME_RULES.kaba.targets.solo.count,
    questionCount: value.questionCount,
    correctCount: value.correctCount,
    aiTurnCount: 0,
    activitySequence: value.activitySequence,
    kabaNextStep: value.kabaNextStep,
    sentencePlan,
    questionHashes,
    ...(result ? { result } : {}),
  };
}

export function ensureKabaProgress(
  state: KabaRunState,
  runVersion: number,
  activeRun = true,
) {
  const progressVersion = state.questionCount + 1;
  const expectedRunVersion = progressVersion + (
    !activeRun && state.result === undefined ? 1 : 0
  );
  const expectedStep: KabaRunNextStep = state.questionCount === state.targetCount
    ? "COMPLETE"
    : "STUDENT_ATTEMPT";
  if (
    runVersion !== expectedRunVersion ||
    state.activitySequence !== state.questionCount ||
    state.kabaNextStep !== expectedStep ||
    new Set(state.questionHashes).size !== state.questionHashes.length ||
    (activeRun && state.result !== undefined) ||
    (state.result !== undefined && state.kabaNextStep !== "COMPLETE")
  ) damaged();
}

export function createKabaState(
  input: QuestionGameRunCreateStateInput,
  randomIndex: RandomIndex = secureRandomIndex,
): KabaRunState {
  const keys = SENTENCE_ENTRIES.map(({ key }) => key);
  for (let index = keys.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    if (!Number.isSafeInteger(swapIndex) || swapIndex < 0 || swapIndex > index) {
      throw new QuestionGameRunError("까바놀이 문장 순서를 만들 수 없습니다", 500);
    }
    [keys[index], keys[swapIndex]] = [keys[swapIndex], keys[index]];
  }
  return {
    game: "kaba",
    locale: input.locale,
    targetCount: QUESTION_GAME_RULES.kaba.targets.solo.count,
    questionCount: 0,
    correctCount: 0,
    aiTurnCount: 0,
    activitySequence: 0,
    kabaNextStep: "STUDENT_ATTEMPT",
    sentencePlan: keys.slice(0, QUESTION_GAME_RULES.kaba.targets.solo.count),
    questionHashes: [],
  };
}

function kabaState(value: unknown): KabaRunState {
  return parseKabaState(value as Prisma.JsonValue);
}

export const kabaRunDefinition: QuestionGameRunDefinition = {
  gameId: "kaba",
  createState: createKabaState,
  parseState: parseKabaState,
  ensureProgress(state: unknown, context: QuestionGameRunProgressContext) {
    ensureKabaProgress(
      kabaState(state),
      context.runVersion,
      context.activeRun,
    );
  },
  publicProgress(state: unknown) {
    const kaba = kabaState(state);
    const complete = kaba.kabaNextStep === "COMPLETE";
    const sentenceKey = complete ? undefined : kaba.sentencePlan[kaba.questionCount];
    if (!complete && !sentenceKey) damaged();
    return {
      questionCount: kaba.questionCount,
      correctCount: kaba.correctCount,
      aiTurnCount: 0,
      awaitingAiTurn: false,
      targetCount: kaba.targetCount,
      currentSentence: sentenceKey ? kabaSentenceText(sentenceKey, kaba.locale) : null,
      kabaNextStep: kaba.kabaNextStep,
    };
  },
  clearTransientState(state: unknown) {
    return kabaState(state);
  },
  result(state: unknown) {
    return kabaState(state).result;
  },
};
