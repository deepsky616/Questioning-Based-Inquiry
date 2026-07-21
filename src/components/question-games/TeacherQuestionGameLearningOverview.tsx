"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { QuestionGameLearningHistory } from "@/components/question-games/QuestionGameLearningHistory";
import type {
  QuestionGameHistoryMode,
  QuestionGameLearningHistory as LearningHistory,
  QuestionGameModeSummary,
} from "@/lib/question-game-history";

interface TeacherClass {
  grade: string;
  className: string;
}

interface TeacherStudent {
  id: string;
  grade: string;
  className: string;
}

interface StudentLearningStat {
  id: string;
  plays: number;
  completions: number;
  modes?: Record<QuestionGameHistoryMode, {
    plays: number;
    completions: number;
  }>;
}

interface GameLearningStat {
  students: StudentLearningStat[];
}

interface Props {
  classes: TeacherClass[];
  students: TeacherStudent[];
  statsByGame: Record<string, GameLearningStat>;
}

const MODES = ["solo", "ai", "friend"] as const;

export function TeacherQuestionGameLearningOverview({ classes, students, statsByGame }: Props) {
  const t = useTranslations("qPlay");
  const tc = useTranslations("common");
  const [selectedClass, setSelectedClass] = useState("");
  const [history, setHistory] = useState<LearningHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const available = classes.map(({ grade, className }) => `${grade}|${className}`);
    if (!available.includes(selectedClass)) setSelectedClass(available[0] ?? "");
  }, [classes, selectedClass]);

  useEffect(() => {
    if (!selectedClass) {
      setHistory(null);
      setLoading(false);
      return;
    }
    const [grade, className] = selectedClass.split("|");
    const controller = new AbortController();
    setHistory(null);
    setLoading(true);
    setLoadError(false);
    const params = new URLSearchParams({ summary: "1", grade, className });
    fetch(`/api/reports/question-games?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data: LearningHistory | { error?: string } = await response.json();
        if (!response.ok || !("totals" in data) || !("modes" in data)) {
          throw new Error("question game class summary failed");
        }
        setHistory(data);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey, selectedClass]);

  const classActivity = useMemo(() => {
    if (!selectedClass) {
      return {
        gameModes: [],
        studentCount: 0,
      };
    }
    const [grade, className] = selectedClass.split("|");
    const studentIds = new Set(
      students
        .filter((student) => student.grade === grade && student.className === className)
        .map((student) => student.id),
    );
    const gameModes: QuestionGameModeSummary[] = Object.entries(statsByGame).map(
      ([gameId, stat]) => {
        const rows = stat.students.filter((student) => studentIds.has(student.id));
        const modes = Object.fromEntries(MODES.map((mode) => {
          const values = rows.map((student) => student.modes?.[mode] ?? {
            plays: 0,
            completions: 0,
          });
          return [mode, {
            plays: values.reduce((sum, value) => sum + value.plays, 0),
            completions: values.reduce((sum, value) => sum + value.completions, 0),
            participants: values.filter((value) => value.plays > 0).length,
          }];
        })) as QuestionGameModeSummary["modes"];
        return { gameId, modes };
      },
    );
    return {
      gameModes,
      studentCount: studentIds.size,
    };
  }, [selectedClass, statsByGame, students]);

  if (classes.length === 0) return null;

  return (
    <section className="space-y-4" aria-labelledby="teacher-question-game-learning-overview">
      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="teacher-question-game-learning-overview" className="text-base font-black text-foreground">
            {t("learningOverviewRegion")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("learningOverviewDesc")}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-bold text-foreground">
          {t("learningClassLabel")}
          <select
            value={selectedClass}
            onChange={(event) => setSelectedClass(event.target.value)}
            className="min-h-10 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground"
          >
            {classes.map(({ grade, className }) => {
              const value = `${grade}|${className}`;
              return <option value={value} key={value}>{t("gradeClass", { grade, className })}</option>;
            })}
          </select>
        </label>
      </header>
      {loading && (
        <div role="status" className="flex min-h-32 items-center justify-center border-y border-border text-sm text-muted-foreground">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          {t("learningOverviewLoading")}
        </div>
      )}
      {loadError && (
        <div className="flex min-h-32 flex-col items-center justify-center gap-3 border-y border-border text-sm text-red-600 dark:text-red-300">
          <p role="alert">{t("learningOverviewLoadError")}</p>
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-current px-3 font-bold"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {tc("retry")}
          </button>
        </div>
      )}
      {history && !loading && !loadError && (
        <QuestionGameLearningHistory
          audience="class"
          hideHeader
          history={{ ...history, gameModes: classActivity.gameModes }}
          classStudentCount={classActivity.studentCount}
        />
      )}
    </section>
  );
}
