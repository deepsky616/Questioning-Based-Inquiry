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
  name: string;
  grade: string;
  className: string;
}

interface StudentLearningStat {
  id: string;
  plays: number;
  completions: number;
  goodQuestions?: number;
  lastPlayedAt?: string | null;
  modes?: Record<QuestionGameHistoryMode, {
    plays: number;
    completions: number;
    goodQuestions?: number;
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
const RECENT_ACTIVITY_DAYS = 14;

function laterActivity(
  current: string | null,
  candidate: string | null | undefined,
) {
  if (!candidate) return current;
  const timestamp = new Date(candidate).getTime();
  if (Number.isNaN(timestamp)) return current;
  if (!current) return candidate;
  return timestamp > new Date(current).getTime() ? candidate : current;
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
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as
          | LearningHistory
          | { error?: string }
          | null;
        if (!response.ok || !data || !("totals" in data) || !("modes" in data)) {
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
        participantCount: 0,
        inactiveStudents: [] as TeacherStudent[],
        oneTimeStudents: [] as TeacherStudent[],
      };
    }
    const [grade, className] = selectedClass.split("|");
    const selectedStudents = students.filter(
      (student) => student.grade === grade && student.className === className,
    );
    const studentIds = new Set(selectedStudents.map((student) => student.id));
    const gameModes: QuestionGameModeSummary[] = Object.entries(statsByGame).map(
      ([gameId, stat]) => {
        const rows = stat.students.filter((student) => studentIds.has(student.id));
        const modes = Object.fromEntries(MODES.map((mode) => {
          const values = rows.map((student) => student.modes?.[mode] ?? {
            plays: 0,
            completions: 0,
            goodQuestions: 0,
          });
          return [mode, {
            plays: values.reduce((sum, value) => sum + value.plays, 0),
            completions: values.reduce((sum, value) => sum + value.completions, 0),
            participants: values.filter((value) => value.plays > 0).length,
            goodQuestions: values.reduce(
              (sum, value) => sum + (value.goodQuestions ?? 0),
              0,
            ),
          }];
        })) as QuestionGameModeSummary["modes"];
        return { gameId, modes };
      },
    );
    const activityByStudent = new Map(selectedStudents.map((student) => [
      student.id,
      { plays: 0, completions: 0, lastPlayedAt: null as string | null },
    ]));
    for (const stat of Object.values(statsByGame)) {
      for (const student of stat.students) {
        const activity = activityByStudent.get(student.id);
        if (!activity) continue;
        activity.plays += student.plays;
        activity.completions += student.completions;
        activity.lastPlayedAt = laterActivity(
          activity.lastPlayedAt,
          student.lastPlayedAt,
        );
      }
    }
    const cutoff = Date.now() - RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000;
    const participantCount = [...activityByStudent.values()].filter(
      ({ plays }) => plays > 0,
    ).length;
    const inactiveStudents = selectedStudents.filter((student) => {
      const lastPlayedAt = activityByStudent.get(student.id)?.lastPlayedAt;
      return !lastPlayedAt || new Date(lastPlayedAt).getTime() < cutoff;
    });
    const oneTimeStudents = selectedStudents.filter(
      (student) => activityByStudent.get(student.id)?.completions === 1,
    );
    return {
      gameModes,
      studentCount: studentIds.size,
      participantCount,
      inactiveStudents,
      oneTimeStudents,
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
          classParticipantCount={classActivity.participantCount}
        />
      )}
      {history && !loading && !loadError && (
        <section
          className="border-y border-border py-4"
          aria-labelledby="question-game-participation-check"
        >
          <h3
            id="question-game-participation-check"
            className="text-sm font-bold text-foreground"
          >
            {t("learningParticipationCheckTitle")}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              {
                label: t("learningInactiveRecent", {
                  days: RECENT_ACTIVITY_DAYS,
                  count: classActivity.inactiveStudents.length,
                }),
                students: classActivity.inactiveStudents,
              },
              {
                label: t("learningOneTime", {
                  count: classActivity.oneTimeStudents.length,
                }),
                students: classActivity.oneTimeStudents,
              },
            ].map((item) => (
              <details className="border-l-2 border-border pl-3" key={item.label}>
                <summary className="cursor-pointer text-xs font-bold text-foreground">
                  {item.label}
                </summary>
                {item.students.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("learningParticipationNone")}
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {item.students.map((student) => (
                      <li
                        className="rounded bg-muted px-2 py-1 text-xs text-foreground"
                        key={student.id}
                      >
                        {student.name}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
