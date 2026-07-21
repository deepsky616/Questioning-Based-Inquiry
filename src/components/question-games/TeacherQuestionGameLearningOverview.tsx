"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { QuestionGameLearningHistory } from "@/components/question-games/QuestionGameLearningHistory";
import type { QuestionGameLearningHistory as LearningHistory } from "@/lib/question-game-history";

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
}

interface GameLearningStat {
  students: StudentLearningStat[];
}

interface Props {
  classes: TeacherClass[];
  students: TeacherStudent[];
  statsByGame: Record<string, GameLearningStat>;
}

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

  const gameComparison = useMemo(() => {
    if (!selectedClass) return [];
    const [grade, className] = selectedClass.split("|");
    const studentIds = new Set(
      students
        .filter((student) => student.grade === grade && student.className === className)
        .map((student) => student.id),
    );
    return Object.entries(statsByGame).map(([gameId, stat]) => {
      const rows = stat.students.filter((student) => studentIds.has(student.id));
      return {
        gameId,
        plays: rows.reduce((sum, student) => sum + student.plays, 0),
        completions: rows.reduce((sum, student) => sum + student.completions, 0),
      };
    });
  }, [selectedClass, statsByGame, students]);

  if (classes.length === 0) return null;

  return (
    <section className="space-y-3" aria-label={t("learningOverviewRegion")}>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{t("learningOverviewDesc")}</p>
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
      </div>
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
          history={history}
          gameComparison={gameComparison}
        />
      )}
    </section>
  );
}
