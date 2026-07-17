import { isValidQuestionForm } from "@/lib/points-policy";

export type QuestionGameLearningStrength =
  | "completed"
  | "startedQuestions"
  | "clearQuestion"
  | "variedQuestions";

export type QuestionGameLearningNextStep =
  | "explainConnection"
  | "clarifyQuestionForm"
  | "expandThinking"
  | "changePerspective";

export interface QuestionGameLearningSummary {
  validQuestionCount: number;
  strength: QuestionGameLearningStrength;
  nextStep: QuestionGameLearningNextStep;
}

export interface QuestionGameModeStats {
  plays: number;
  completions: number;
  points: number;
  goodQuestions: number;
}

export type QuestionGameMode = "solo" | "ai" | "friend";

const EMPTY_MODE_STATS: Readonly<QuestionGameModeStats> = {
  plays: 0,
  completions: 0,
  points: 0,
  goodQuestions: 0,
};

const THINKING_PROMPT = /(?:왜|어떻게|무엇|어떤|어느|what|why|how)/i;

export function buildQuestionGameLearningSummary(
  questions: string[],
  completedActivities: number,
): QuestionGameLearningSummary {
  const normalized = questions.map((question) => question.trim()).filter(Boolean);
  const validQuestionCount = normalized.filter(isValidQuestionForm).length;

  if (normalized.length === 0) {
    return {
      validQuestionCount: 0,
      strength: "completed",
      nextStep: "explainConnection",
    };
  }

  if (validQuestionCount < normalized.length) {
    return {
      validQuestionCount,
      strength: validQuestionCount > 0 || completedActivities > 0
        ? "startedQuestions"
        : "completed",
      nextStep: "clarifyQuestionForm",
    };
  }

  return {
    validQuestionCount,
    strength: normalized.length > 1 ? "variedQuestions" : "clearQuestion",
    nextStep: normalized.some((question) => THINKING_PROMPT.test(question))
      ? "changePerspective"
      : "expandThinking",
  };
}

export function sumQuestionGameModes(
  students: Array<{
    modes?: Partial<Record<QuestionGameMode, QuestionGameModeStats>>;
  }>,
): Record<QuestionGameMode, QuestionGameModeStats> {
  const total: Record<QuestionGameMode, QuestionGameModeStats> = {
    solo: { ...EMPTY_MODE_STATS },
    ai: { ...EMPTY_MODE_STATS },
    friend: { ...EMPTY_MODE_STATS },
  };

  for (const student of students) {
    for (const mode of ["solo", "ai", "friend"] as const) {
      const value = student.modes?.[mode] ?? EMPTY_MODE_STATS;
      total[mode].plays += value.plays;
      total[mode].completions += value.completions;
      total[mode].points += value.points;
      total[mode].goodQuestions += value.goodQuestions;
    }
  }

  return total;
}
