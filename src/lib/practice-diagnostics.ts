import { practiceDayKey } from "@/lib/practice-points";
import { PRACTICE_QUIZ_BANK, PRACTICE_TRANSFORM_BANK } from "@/lib/question-practice-data";

export type PracticeFocus = "closed" | "open" | "factual" | "conceptual" | "controversial";

export interface PracticeAttemptInput {
  id: string;
  studentId: string;
  mode: string;
  itemId: string | null;
  quizType: string | null;
  correct: boolean;
  createdAt: Date;
}

export interface AccuracyMetric {
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export type PracticeRecommendation =
  | { kind: "collect"; tab: "quiz"; quizMode: "cognitive"; focus: null }
  | {
      kind: "focus";
      tab: "quiz";
      quizMode: "closure" | "cognitive";
      focus: PracticeFocus;
    }
  | { kind: "advance"; tab: "transform"; quizMode: null; focus: null };

export interface PracticeDiagnostic {
  activityAttempts: number;
  diagnosticAttempts: number;
  overall: AccuracyMetric;
  modes: Record<"quiz" | "transform" | "create", AccuracyMetric>;
  types: Record<PracticeFocus, AccuracyMetric>;
  unknownTypeAttempts: number;
  recommendation: PracticeRecommendation;
}

export interface PracticeRecommendationSelection {
  tab: "quiz" | "transform";
  quizMode: "closure" | "cognitive";
  focus: PracticeFocus | null;
}

const FOCUS_ORDER: PracticeFocus[] = ["closed", "open", "factual", "conceptual", "controversial"];
const QUIZ_BY_ID = new Map(PRACTICE_QUIZ_BANK.map((item) => [item.id, item]));
const TRANSFORM_BY_ID = new Map(PRACTICE_TRANSFORM_BANK.map((item) => [item.id, item]));

type MetricCounts = { attempts: number; correct: number };
type NormalizedMode = keyof PracticeDiagnostic["modes"];

function emptyCounts(): MetricCounts {
  return { attempts: 0, correct: 0 };
}

function addAttempt(counts: MetricCounts, correct: boolean): void {
  counts.attempts += 1;
  if (correct) counts.correct += 1;
}

function metricFrom(counts: MetricCounts): AccuracyMetric {
  return {
    ...counts,
    accuracy: counts.attempts === 0 ? null : Math.round((counts.correct / counts.attempts) * 100),
  };
}

function normalizedMode(mode: string): NormalizedMode | null {
  if (mode === "quiz") return "quiz";
  if (mode === "transform" || mode === "transform-ai") return "transform";
  if (mode === "create" || mode === "create-ai") return "create";
  return null;
}

function focusForAttempt(attempt: PracticeAttemptInput): PracticeFocus | null {
  if (attempt.mode === "quiz" && attempt.itemId) {
    const item = QUIZ_BY_ID.get(attempt.itemId);
    if (!item) return null;
    if (attempt.quizType === "closure") return item.closure;
    if (attempt.quizType === "cognitive") return item.cognitive;
    return null;
  }

  if (attempt.mode === "transform" && attempt.itemId) {
    return TRANSFORM_BY_ID.get(attempt.itemId)?.target ?? null;
  }

  return null;
}

function recommendationFor(
  types: Record<PracticeFocus, AccuracyMetric>,
  latestWrongByType: Record<PracticeFocus, number | null>,
): PracticeRecommendation {
  const sufficientlySampled = FOCUS_ORDER.filter((focus) => types[focus].attempts >= 3);
  if (sufficientlySampled.length === 0) {
    return { kind: "collect", tab: "quiz", quizMode: "cognitive", focus: null };
  }

  const firstUnderSampled = FOCUS_ORDER.find((focus) => types[focus].attempts < 3);
  if (firstUnderSampled) return focusRecommendation(firstUnderSampled);

  if (
    FOCUS_ORDER.every(
      (focus) => types[focus].correct * 100 >= types[focus].attempts * 80,
    )
  ) {
    return { kind: "advance", tab: "transform", quizMode: null, focus: null };
  }

  const weakest = [...FOCUS_ORDER].sort((left, right) => {
    const leftMetric = types[left];
    const rightMetric = types[right];
    const ratioComparison =
      leftMetric.correct * rightMetric.attempts - rightMetric.correct * leftMetric.attempts;
    if (ratioComparison !== 0) return ratioComparison;

    const leftWrong = latestWrongByType[left];
    const rightWrong = latestWrongByType[right];
    if (leftWrong !== rightWrong) {
      if (leftWrong === null) return 1;
      if (rightWrong === null) return -1;
      return rightWrong - leftWrong;
    }

    return FOCUS_ORDER.indexOf(left) - FOCUS_ORDER.indexOf(right);
  })[0];

  return focusRecommendation(weakest);
}

function focusRecommendation(focus: PracticeFocus): PracticeRecommendation {
  return {
    kind: "focus",
    tab: "quiz",
    quizMode: focus === "closed" || focus === "open" ? "closure" : "cognitive",
    focus,
  };
}

export function buildPracticeDiagnostic(attempts: readonly PracticeAttemptInput[]): PracticeDiagnostic {
  const sortedAttempts = [...attempts].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const seen = new Set<string>();
  const diagnosticAttempts = sortedAttempts.filter((attempt) => {
    const key = JSON.stringify([
      practiceDayKey(attempt.createdAt),
      attempt.studentId,
      attempt.mode,
      attempt.itemId ?? "ai",
      attempt.quizType,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const overall = emptyCounts();
  const modeCounts: Record<NormalizedMode, MetricCounts> = {
    quiz: emptyCounts(),
    transform: emptyCounts(),
    create: emptyCounts(),
  };
  const typeCounts = Object.fromEntries(
    FOCUS_ORDER.map((focus) => [focus, emptyCounts()]),
  ) as Record<PracticeFocus, MetricCounts>;
  const latestWrongByType = Object.fromEntries(
    FOCUS_ORDER.map((focus) => [focus, null]),
  ) as Record<PracticeFocus, number | null>;
  let unknownTypeAttempts = 0;

  for (const attempt of diagnosticAttempts) {
    addAttempt(overall, attempt.correct);
    const mode = normalizedMode(attempt.mode);
    if (mode) addAttempt(modeCounts[mode], attempt.correct);

    const focus = focusForAttempt(attempt);
    if (!focus) {
      unknownTypeAttempts += 1;
      continue;
    }

    addAttempt(typeCounts[focus], attempt.correct);
    if (!attempt.correct && latestWrongByType[focus] === null) {
      latestWrongByType[focus] = attempt.createdAt.getTime();
    }
  }

  const modes = Object.fromEntries(
    Object.entries(modeCounts).map(([mode, counts]) => [mode, metricFrom(counts)]),
  ) as PracticeDiagnostic["modes"];
  const types = Object.fromEntries(
    FOCUS_ORDER.map((focus) => [focus, metricFrom(typeCounts[focus])]),
  ) as PracticeDiagnostic["types"];

  return {
    activityAttempts: attempts.length,
    diagnosticAttempts: diagnosticAttempts.length,
    overall: metricFrom(overall),
    modes,
    types,
    unknownTypeAttempts,
    recommendation: recommendationFor(types, latestWrongByType),
  };
}

export function practiceSelectionForRecommendation(
  recommendation: PracticeRecommendation,
): PracticeRecommendationSelection {
  if (recommendation.kind === "advance") {
    return { tab: "transform", quizMode: "cognitive", focus: null };
  }

  return {
    tab: "quiz",
    quizMode: recommendation.quizMode,
    focus: recommendation.focus,
  };
}
