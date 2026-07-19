"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { QuestionGameLearningHistory } from "@/components/question-games/QuestionGameLearningHistory";
import {
  sumQuestionGameModes,
  type QuestionGameModeStats,
} from "@/lib/question-game-learning-summary";
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
  modes: Record<"solo" | "ai" | "friend", QuestionGameModeStats>;
}

interface GameLearningStat {
  students: StudentLearningStat[];
}

interface Props {
  classes: TeacherClass[];
  students: TeacherStudent[];
  statsByGame: Record<string, GameLearningStat>;
}

const emptyHistory: LearningHistory = {
  totals: { plays: 0, points: 0, goodQuestions: 0 },
  modes: {
    solo: { plays: 0, points: 0, goodQuestions: 0 },
    ai: { plays: 0, points: 0, goodQuestions: 0 },
    friend: { plays: 0, points: 0, goodQuestions: 0 },
  },
  recent: [],
  nextCursor: null,
};

export function TeacherQuestionGameLearningOverview({ classes, students, statsByGame }: Props) {
  const t = useTranslations("qPlay");
  const [selectedClass, setSelectedClass] = useState("");

  useEffect(() => {
    const available = classes.map(({ grade, className }) => `${grade}|${className}`);
    if (!available.includes(selectedClass)) setSelectedClass(available[0] ?? "");
  }, [classes, selectedClass]);

  const history = useMemo<LearningHistory>(() => {
    if (!selectedClass) return emptyHistory;
    const [grade, className] = selectedClass.split("|");
    const studentIds = new Set(
      students
        .filter((student) => student.grade === grade && student.className === className)
        .map((student) => student.id),
    );
    const rows = Object.values(statsByGame)
      .flatMap((stat) => stat.students)
      .filter((student) => studentIds.has(student.id));
    const modes = sumQuestionGameModes(rows);

    return {
      totals: {
        plays: modes.solo.completions + modes.ai.completions + modes.friend.completions,
        points: modes.solo.points + modes.ai.points + modes.friend.points,
        goodQuestions: modes.solo.goodQuestions + modes.ai.goodQuestions + modes.friend.goodQuestions,
      },
      modes: {
        solo: { plays: modes.solo.completions, points: modes.solo.points, goodQuestions: modes.solo.goodQuestions },
        ai: { plays: modes.ai.completions, points: modes.ai.points, goodQuestions: modes.ai.goodQuestions },
        friend: { plays: modes.friend.completions, points: modes.friend.points, goodQuestions: modes.friend.goodQuestions },
      },
      recent: [],
      nextCursor: null,
    };
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
      <QuestionGameLearningHistory audience="class" history={history} />
    </section>
  );
}
