"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { QuestionGameActivityComparison } from "@/components/question-games/QuestionGameActivityComparison";
import type { QuestionGameLearningHistory } from "@/lib/question-game-history";

interface Props {
  audience: "student" | "teacher" | "class";
  history: QuestionGameLearningHistory;
  classStudentCount?: number;
}

const GRID_COLOR = "hsl(var(--border))";
const TICK_COLOR = "hsl(var(--muted-foreground))";
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: `1px solid ${GRID_COLOR}`,
  borderRadius: 8,
  color: "hsl(var(--card-foreground))",
  fontSize: 12,
} as const;
function weekLabel(weekStart: string, locale: string) {
  const date = new Date(`${weekStart}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return weekStart;
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function QuestionGameLearningCharts({
  audience,
  history,
  classStudentCount,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("gamePlay");
  const weekly = (history.weekly ?? []).map((point) => ({
    ...point,
    label: weekLabel(point.weekStart, locale),
  }));
  const showWeekly = weekly.length > 0;
  const showComparison = (history.gameModes ?? []).length > 0;

  if (history.totals.plays === 0 || (!showWeekly && !showComparison)) {
    return (
      <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
        {t("learningChartEmpty")}
      </p>
    );
  }

  return (
    <div className={audience === "class"
      ? "mt-4 space-y-6 border-t border-border pt-4"
      : "mt-4 grid gap-5 border-t border-border pt-4 lg:grid-cols-2"}
    >
      {showWeekly && (
        <figure className="min-w-0" aria-labelledby={`question-game-weekly-${audience}`}>
          <figcaption
            id={`question-game-weekly-${audience}`}
            className="mb-3 text-sm font-bold text-foreground"
          >
            {t("weeklyTrendTitle")}
          </figcaption>
          <div role="img" aria-label={t("weeklyTrendAria")}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weekly} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" stroke={GRID_COLOR} tick={{ fontSize: 11, fill: TICK_COLOR }} />
                <YAxis allowDecimals={false} stroke={GRID_COLOR} tick={{ fontSize: 11, fill: TICK_COLOR }} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "hsl(var(--card-foreground))" }}
                  itemStyle={{ color: "hsl(var(--card-foreground))" }}
                  cursor={{ stroke: GRID_COLOR }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="plays"
                  name={t("completedGames")}
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="goodQuestions"
                  name={t("goodQuestions")}
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="sr-only">
            {weekly.map((point) => (
              <li key={point.weekStart}>
                {t("weeklyActivitySummary", {
                  week: point.label,
                  plays: point.plays,
                  goodQuestions: point.goodQuestions,
                })}
              </li>
            ))}
          </ul>
        </figure>
      )}

      {showComparison && (
        <QuestionGameActivityComparison
          audience={audience}
          gameModes={history.gameModes ?? []}
          classStudentCount={classStudentCount}
        />
      )}
    </div>
  );
}
