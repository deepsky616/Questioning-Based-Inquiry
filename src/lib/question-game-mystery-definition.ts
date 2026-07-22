import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { isQuestionFormForLocale } from "@/lib/question-game-i18n";
import {
  CURRENT_MYSTERY_KNOWLEDGE_VERSION,
  MYSTERY_ITEMS,
  analyzeMysteryQuestion,
  getMysteryItem,
  isMysteryAnswerEvidence,
  isMysteryGuessCorrect,
  mysteryQuestionForAttribute,
  mysteryAttributesForVersion,
  mysteryItemsForVersion,
  resolveMysteryAttribute,
  type MysteryAnswer,
  type MysteryAnswerEvidence,
  type MysteryAttribute,
  type MysteryFact,
  type MysteryKnowledgeVersion,
  type MysteryLocale,
} from "@/lib/mystery-box-rules";
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
import {
  QUESTION_GAME_LIMITS,
  QUESTION_GAME_RULES,
} from "@/lib/question-game-rules";

export type MysteryActor = "STUDENT" | "AI";
export type MysteryNextStep = "STUDENT_ACTION" | "AI_TURN" | "COMPLETE";
export type MysteryWinner = MysteryActor;
export type MysteryEndReason = "SOLVED" | "LIMIT";

interface MysteryHistoryBase {
  sequence: number;
  actor: MysteryActor;
  locale: MysteryLocale;
  text: string;
  textHash: string;
}

export type MysteryRunHistoryItem =
  | MysteryHistoryBase & {
      kind: "QUESTION";
      answer: Exclude<MysteryAnswer, "unknown">;
      answerSource: "RULE" | "AI";
      attribute?: MysteryFact;
      negated?: boolean;
      answerEvidence?: MysteryAnswerEvidence;
    }
  | MysteryHistoryBase & {
      kind: "GUESS";
      correct: boolean;
      guessedItemId?: string;
    };

export interface MysteryRunState {
  game: "mystery-box";
  knowledgeVersion: MysteryKnowledgeVersion;
  mysteryLocale: MysteryLocale;
  targetCount: 20;
  questionCount: number;
  aiTurnCount: number;
  activitySequence: number;
  mysteryStudentQuestionCount: number;
  mysteryNextStep: MysteryNextStep;
  history: MysteryRunHistoryItem[];
  privateItemId: string;
  mysteryWinner?: MysteryWinner;
  mysteryEndReason?: MysteryEndReason;
  result?: QuestionGameRunResult;
}

export type MysteryAiPlan =
  | {
      kind: "QUESTION";
      text: string;
      attribute: MysteryFact;
      negated: false;
    }
  | {
      kind: "GUESS";
      text: string;
      guessedItemId: string;
    };

export type MysteryAiHistoryItem =
  | { kind: "QUESTION"; text: string; answer: "yes" | "no" }
  | { kind: "GUESS"; text: string; correct: boolean };

type RandomIndex = (upperExclusive: number) => number;

const TARGET_COUNT = QUESTION_GAME_RULES["mystery-box"].targets.solo.count;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const HISTORY_BASE_KEYS = [
  "sequence",
  "actor",
  "kind",
  "locale",
  "text",
  "textHash",
] as const;

function damaged(): never {
  throw new QuestionGameRunError("미스터리 박스 실행 상태가 손상되었습니다", 409);
}

function secureRandomIndex(upperExclusive: number) {
  return randomInt(0, upperExclusive);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isAttribute(
  value: unknown,
  knowledgeVersion: MysteryKnowledgeVersion,
): value is MysteryFact {
  return mysteryAttributesForVersion(knowledgeVersion).includes(value as never);
}

function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === "string" &&
    [...value].length > 0 &&
    [...value].length <= max &&
    value === value.trim();
}

function matchingMysteryItemId(text: string, locale: MysteryLocale) {
  return MYSTERY_ITEMS.find((item) =>
    isMysteryGuessCorrect(text, item, locale)
  )?.id;
}

function parseHistoryItem(
  value: unknown,
  index: number,
  privateItemId: string,
  knowledgeVersion: MysteryKnowledgeVersion,
): MysteryRunHistoryItem {
  if (
    !isQuestionGameRunRecord(value) ||
    value.sequence !== index + 1 ||
    (value.actor !== "STUDENT" && value.actor !== "AI") ||
    (value.locale !== "ko" && value.locale !== "en") ||
    typeof value.textHash !== "string" ||
    !HASH_PATTERN.test(value.textHash)
  ) damaged();
  const locale = value.locale;
  const item = getMysteryItem(privateItemId);
  if (!item) damaged();

  if (value.kind === "QUESTION") {
    if (
      !hasOnlyKeys(value, [
        ...HISTORY_BASE_KEYS,
        "answer",
        "answerSource",
        "attribute",
        "negated",
        "answerEvidence",
      ]) ||
      !isBoundedText(value.text, QUESTION_GAME_LIMITS.question) ||
      !/[?？]/u.test(value.text) ||
      !isQuestionFormForLocale(value.text, locale) ||
      (value.answer !== "yes" && value.answer !== "no") ||
      (value.answerSource !== "RULE" && value.answerSource !== "AI")
    ) damaged();
    const analysis = analyzeMysteryQuestion(
      value.text,
      item,
      locale,
      knowledgeVersion,
    );
    if (value.answerSource === "RULE") {
      if (
      !isAttribute(value.attribute, knowledgeVersion) ||
      typeof value.negated !== "boolean" ||
      analysis.answer === "unknown" ||
      analysis.answer !== value.answer ||
      analysis.attribute !== value.attribute ||
      analysis.negated !== value.negated
      ) damaged();
    } else if (
      value.attribute !== undefined ||
      value.negated !== undefined ||
      analysis.answer !== "unknown" ||
      (value.answerEvidence === undefined && knowledgeVersion >= 3) ||
      (value.answerEvidence !== undefined && (
        !isMysteryAnswerEvidence(value.answerEvidence, knowledgeVersion) ||
        resolveMysteryAttribute(
          item,
          value.answerEvidence.attribute,
          value.answerEvidence.negated,
          knowledgeVersion,
        ) !== value.answer
      ))
    ) damaged();
    return {
      sequence: index + 1,
      actor: value.actor,
      kind: "QUESTION",
      locale,
      text: value.text,
      textHash: value.textHash,
      answer: value.answer,
      answerSource: value.answerSource,
      ...(value.answerSource === "RULE"
        ? {
            attribute: value.attribute as MysteryFact,
            negated: value.negated as boolean,
          }
        : {
            ...(value.answerEvidence !== undefined
              ? { answerEvidence: value.answerEvidence as MysteryAnswerEvidence }
              : {}),
          }),
    };
  }

  if (
    value.kind !== "GUESS" ||
    !hasOnlyKeys(value, [
      ...HISTORY_BASE_KEYS,
      "correct",
      "guessedItemId",
    ]) ||
    !isBoundedText(value.text, QUESTION_GAME_LIMITS.shortWord) ||
    typeof value.correct !== "boolean"
  ) damaged();
  const guessedItemId = matchingMysteryItemId(value.text, locale);
  if (
    value.guessedItemId !== guessedItemId ||
    value.correct !== isMysteryGuessCorrect(value.text, item, locale)
  ) damaged();
  return {
    sequence: index + 1,
    actor: value.actor,
    kind: "GUESS",
    locale,
    text: value.text,
    textHash: value.textHash,
    correct: value.correct,
    ...(guessedItemId ? { guessedItemId } : {}),
  };
}

export function parseMysteryState(value: Prisma.JsonValue): MysteryRunState {
  const knowledgeVersion = isQuestionGameRunRecord(value) &&
      (value.knowledgeVersion === 1 ||
        value.knowledgeVersion === 2 ||
        value.knowledgeVersion === 3)
    ? value.knowledgeVersion
    : 1;
  if (
    !isQuestionGameRunRecord(value) ||
    value.game !== "mystery-box" ||
    (value.mysteryLocale !== "ko" && value.mysteryLocale !== "en") ||
    value.targetCount !== TARGET_COUNT ||
    typeof value.questionCount !== "number" ||
    !Number.isSafeInteger(value.questionCount) ||
    value.questionCount < 0 ||
    value.questionCount > TARGET_COUNT ||
    typeof value.aiTurnCount !== "number" ||
    !Number.isSafeInteger(value.aiTurnCount) ||
    value.aiTurnCount < 0 ||
    value.aiTurnCount > TARGET_COUNT ||
    value.activitySequence !== value.questionCount ||
    typeof value.mysteryStudentQuestionCount !== "number" ||
    !Number.isSafeInteger(value.mysteryStudentQuestionCount) ||
    value.mysteryStudentQuestionCount < 0 ||
    value.mysteryStudentQuestionCount > TARGET_COUNT ||
    (value.mysteryNextStep !== "STUDENT_ACTION" &&
      value.mysteryNextStep !== "AI_TURN" &&
      value.mysteryNextStep !== "COMPLETE") ||
    !isDenseArray(value.history) ||
    value.history.length !== value.questionCount ||
    typeof value.privateItemId !== "string" ||
    getMysteryItem(value.privateItemId) === null ||
    (value.knowledgeVersion !== undefined &&
      value.knowledgeVersion !== 1 &&
      value.knowledgeVersion !== 2 &&
      value.knowledgeVersion !== 3) ||
    (value.mysteryWinner !== undefined &&
      value.mysteryWinner !== "STUDENT" &&
      value.mysteryWinner !== "AI") ||
    (value.mysteryEndReason !== undefined &&
      value.mysteryEndReason !== "SOLVED" &&
      value.mysteryEndReason !== "LIMIT")
  ) damaged();
  const history = value.history.map((item, index) =>
    parseHistoryItem(
      item,
      index,
      value.privateItemId as string,
      knowledgeVersion,
    )
  );
  const result = parseQuestionGameRunResult(value.result);
  return {
    game: "mystery-box",
    knowledgeVersion,
    mysteryLocale: value.mysteryLocale,
    targetCount: TARGET_COUNT,
    questionCount: value.questionCount,
    aiTurnCount: value.aiTurnCount,
    activitySequence: value.questionCount,
    mysteryStudentQuestionCount: value.mysteryStudentQuestionCount,
    mysteryNextStep: value.mysteryNextStep,
    history,
    privateItemId: value.privateItemId,
    ...(value.mysteryWinner ? { mysteryWinner: value.mysteryWinner } : {}),
    ...(value.mysteryEndReason ? { mysteryEndReason: value.mysteryEndReason } : {}),
    ...(result ? { result } : {}),
  };
}

function candidateItems(
  history: readonly MysteryAiHistoryItem[],
  locale: MysteryLocale,
  knowledgeVersion: MysteryKnowledgeVersion,
) {
  let candidates = [...mysteryItemsForVersion(knowledgeVersion)];
  for (const activity of history) {
    if (activity.kind === "QUESTION") {
      const filtered = candidates.filter((item) => {
        const analysis = analyzeMysteryQuestion(
          activity.text,
          item,
          locale,
          knowledgeVersion,
        );
        return analysis.answer === activity.answer;
      });
      if (filtered.length > 0) candidates = filtered;
    } else if (activity.kind === "GUESS" && !activity.correct) {
      candidates = candidates.filter((item) =>
        !isMysteryGuessCorrect(activity.text, item, locale)
      );
    }
  }
  return candidates;
}

export function planMysteryAiActivity(
  history: readonly MysteryAiHistoryItem[],
  locale: MysteryLocale,
  knowledgeVersion: MysteryKnowledgeVersion = CURRENT_MYSTERY_KNOWLEDGE_VERSION,
): MysteryAiPlan {
  const candidates = candidateItems(history, locale, knowledgeVersion);
  if (candidates.length === 1) {
    const candidate = candidates[0];
    return {
      kind: "GUESS",
      text: candidate.names[locale],
      guessedItemId: candidate.id,
    };
  }
  const used = new Set(history.flatMap((activity) => {
    if (activity.kind !== "QUESTION") return [];
    const analysis = analyzeMysteryQuestion(
      activity.text,
      MYSTERY_ITEMS[0],
      locale,
      knowledgeVersion,
    );
    return analysis.answer === "unknown" ? [] : [analysis.attribute];
  }));
  const attribute = mysteryAttributesForVersion(knowledgeVersion)
    .filter((candidate) => !used.has(candidate))
    .filter((candidate) => knowledgeVersion !== 3 || candidates.every(
      (item) => typeof item.factsV3[candidate] === "boolean",
    ))
    .map((candidate) => {
      const yesCount = candidates.filter((item) =>
        knowledgeVersion === 1
          ? item.attributes[candidate as MysteryAttribute]
          : knowledgeVersion === 2
            ? item.facts[candidate]
            : item.factsV3[candidate] === true
      ).length;
      return {
        attribute: candidate,
        split: Math.min(yesCount, candidates.length - yesCount),
      };
    })
    .sort((left, right) => right.split - left.split)[0]?.attribute;
  if (!attribute) {
    const candidate = candidates[0] ?? mysteryItemsForVersion(knowledgeVersion)[0];
    if (!candidate) damaged();
    return {
      kind: "GUESS",
      text: candidate.names[locale],
      guessedItemId: candidate.id,
    };
  }
  return {
    kind: "QUESTION",
    text: mysteryQuestionForAttribute(attribute, locale),
    attribute,
    negated: false,
  };
}

export function ensureMysteryProgress(
  state: MysteryRunState,
  mode: QuestionGameRunMode,
  runVersion: number,
  activeRun = true,
) {
  const settled = state.result !== undefined;
  const expectedVersion = state.activitySequence + 1 +
    (!activeRun && !settled ? 1 : 0);
  const expectedAiTurns = state.history.filter(({ actor }) => actor === "AI").length;
  const expectedStudentQuestions = state.history.filter((activity) =>
    activity.actor === "STUDENT" && activity.kind === "QUESTION"
  ).length;
  const questionHashes = state.history.flatMap((activity) =>
    activity.kind === "QUESTION" ? [activity.textHash] : []
  );
  const correctGuesses = state.history.filter((activity) =>
    activity.kind === "GUESS" && activity.correct
  );
  const last = state.history.at(-1);
  const solved = correctGuesses.length === 1 && last === correctGuesses[0];
  const complete = solved || state.questionCount === state.targetCount;
  const expectedNextStep: MysteryNextStep = complete
    ? "COMPLETE"
    : mode === "AI" && state.questionCount % 2 === 1
      ? "AI_TURN"
      : "STUDENT_ACTION";

  if (
    runVersion !== expectedVersion ||
    state.activitySequence !== state.questionCount ||
    state.history.length !== state.questionCount ||
    state.aiTurnCount !== expectedAiTurns ||
    state.mysteryStudentQuestionCount !== expectedStudentQuestions ||
    new Set(questionHashes).size !== questionHashes.length ||
    correctGuesses.length > 1 ||
    state.mysteryNextStep !== expectedNextStep ||
    (mode === "SOLO" && state.aiTurnCount !== 0) ||
    (state.mysteryWinner !== undefined) !== solved ||
    (solved && state.mysteryWinner !== last?.actor) ||
    (state.mysteryEndReason !== undefined) !== complete ||
    (complete && state.mysteryEndReason !== (solved ? "SOLVED" : "LIMIT")) ||
    (settled && !complete) ||
    (activeRun && settled)
  ) damaged();

  for (let index = 0; index < state.history.length; index += 1) {
    const activity = state.history[index];
    const expectedActor: MysteryActor = mode === "AI" && index % 2 === 1
      ? "AI"
      : "STUDENT";
    if (
      activity.actor !== expectedActor ||
      activity.locale !== state.mysteryLocale
    ) damaged();
    if (activity.actor === "AI") {
      const plan = planMysteryAiActivity(
        state.history.slice(0, index),
        state.mysteryLocale,
        state.knowledgeVersion,
      );
      if (
        activity.kind !== plan.kind ||
        activity.text !== plan.text ||
        (activity.kind === "QUESTION" && (
          plan.kind !== "QUESTION" ||
          activity.answerSource !== "RULE" ||
          activity.attribute !== plan.attribute ||
          activity.negated !== false
        )) ||
        (activity.kind === "GUESS" && (
          plan.kind !== "GUESS" ||
          activity.guessedItemId !== plan.guessedItemId
        ))
      ) damaged();
    }
  }
}

export function createMysteryState(
  input: QuestionGameRunCreateStateInput,
  randomIndex: RandomIndex = secureRandomIndex,
): MysteryRunState {
  const index = randomIndex(MYSTERY_ITEMS.length);
  if (!Number.isSafeInteger(index) || index < 0 || index >= MYSTERY_ITEMS.length) {
    throw new QuestionGameRunError("미스터리 박스 물건을 고를 수 없습니다", 500);
  }
  return {
    game: "mystery-box",
    knowledgeVersion: CURRENT_MYSTERY_KNOWLEDGE_VERSION,
    mysteryLocale: input.locale,
    targetCount: TARGET_COUNT,
    questionCount: 0,
    aiTurnCount: 0,
    activitySequence: 0,
    mysteryStudentQuestionCount: 0,
    mysteryNextStep: "STUDENT_ACTION",
    history: [],
    privateItemId: MYSTERY_ITEMS[index].id,
  };
}

function mysteryState(value: unknown) {
  return parseMysteryState(value as Prisma.JsonValue);
}

function publicHistoryItem(activity: MysteryRunHistoryItem) {
  return activity.kind === "QUESTION"
    ? {
        sequence: activity.sequence,
        actor: activity.actor,
        kind: activity.kind,
        text: activity.text,
        answer: activity.answer,
      }
    : {
        sequence: activity.sequence,
        actor: activity.actor,
        kind: activity.kind,
        text: activity.text,
        correct: activity.correct,
      };
}

export const mysteryRunDefinition: QuestionGameRunDefinition = {
  gameId: "mystery-box",
  createState: createMysteryState,
  parseState: parseMysteryState,
  ensureProgress(state: unknown, context: QuestionGameRunProgressContext) {
    ensureMysteryProgress(
      mysteryState(state),
      context.mode,
      context.runVersion,
      context.activeRun,
    );
  },
  publicProgress(state: unknown, mode: QuestionGameRunMode) {
    const mystery = mysteryState(state);
    const answerVisible = mystery.mysteryNextStep === "COMPLETE" &&
      mystery.result !== undefined;
    return {
      questionCount: mystery.questionCount,
      aiTurnCount: mystery.aiTurnCount,
      awaitingAiTurn: mode === "AI" && mystery.mysteryNextStep === "AI_TURN",
      targetCount: mystery.targetCount,
      mysteryLocale: mystery.mysteryLocale,
      mysteryNextStep: mystery.mysteryNextStep,
      mysteryActivityCount: mystery.questionCount,
      mysteryStudentQuestionCount: mystery.mysteryStudentQuestionCount,
      mysteryHistory: mystery.history.map(publicHistoryItem),
      mysteryWinner: mystery.mysteryWinner ?? null,
      mysteryEndReason: mystery.mysteryEndReason ?? null,
      mysteryAnswerItemId: answerVisible ? mystery.privateItemId : null,
    };
  },
  clearTransientState(state: unknown) {
    return mysteryState(state);
  },
  result(state: unknown) {
    return mysteryState(state).result;
  },
};
