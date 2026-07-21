"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BUILT_IN_GAMES,
  localizeQuestionGames,
} from "@/lib/question-games-data";
import type {
  QuestionGameHistoryMode,
  QuestionGameLearningHistory,
} from "@/lib/question-game-history";

export interface QuestionGameCompletionComparison {
  gameId: string;
  plays: number;
  completions: number;
}

interface Props {
  audience: "student" | "teacher" | "class";
  history: QuestionGameLearningHistory;
  gameComparison?: QuestionGameCompletionComparison[];
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
const MODE_COLORS: Record<QuestionGameHistoryMode, string> = {
  solo: "#2563eb",
  ai: "#e11d48",
  friend: "#d97706",
};

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
  gameComparison = [],
}: Props) {
  const locale = useLocale();
  const t = useTranslations("gamePlay");
  const games = useMemo(() => localizeQuestionGames(BUILT_IN_GAMES, locale), [locale]);
  const modeLabels: Record<QuestionGameHistoryMode, string> = {
    solo: t("modeSolo"),
    ai: t("modeAi"),
    friend: t("modeFriend"),
  };
  const weekly = (history.weekly ?? []).map((point) => ({
    ...point,
    label: weekLabel(point.weekStart, locale),
  }));
  const modes = (["solo", "ai", "friend"] as const).map((mode) => ({
    mode,
    name: modeLabels[mode],
    plays: history.modes[mode].plays,
  }));
  const completionByGame = games
    .map((game) => {
      const value = gameComparison.find(({ gameId }) => gameId === game.id);
      if (!value || value.plays <= 0) return null;
      return {
        gameId: game.id,
        name: game.title,
        plays: value.plays,
        completions: value.completions,
        completionRate: Math.min(100, Math.round((value.completions / value.plays) * 100)),
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const showWeekly = weekly.length > 0;
  const showComparison = audience === "class"
    ? completionByGame.length > 0
    : modes.some(({ plays }) => plays > 0);

  if (history.totals.plays === 0 || (!showWeekly && !showComparison)) {
    return (
      <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
        {t("learningChartEmpty")}
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-5 border-t border-border pt-4 lg:grid-cols-2">
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

      {audience === "class" && completionByGame.length > 0 ? (
        <figure className="min-w-0" aria-labelledby="question-game-completion-class">
          <figcaption id="question-game-completion-class" className="mb-3 text-sm font-bold text-foreground">
            {t("gameCompletionTitle")}
          </figcaption>
          <div role="img" aria-label={t("gameCompletionAria")}>
            <ResponsiveContainer width="100%" height={Math.max(220, completionByGame.length * 36)}>
              <BarChart
                data={completionByGame}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  stroke={GRID_COLOR}
                  tick={{ fontSize: 11, fill: TICK_COLOR }}
                  tickFormatter={(value) => `${value}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={92}
                  interval={0}
                  stroke={GRID_COLOR}
                  tick={{ fontSize: 11, fill: TICK_COLOR }}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "hsl(var(--card-foreground))" }}
                  itemStyle={{ color: "hsl(var(--card-foreground))" }}
                  cursor={{ fill: GRID_COLOR, opacity: 0.3 }}
                />
                <Bar
                  dataKey="completionRate"
                  name={t("completionRate")}
                  unit="%"
                  fill="#0891b2"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="sr-only">
            {completionByGame.map((game) => (
              <li key={game.gameId}>
                {t("gameCompletionSummary", {
                  game: game.name,
                  completions: game.completions,
                  plays: game.plays,
                  rate: game.completionRate,
                })}
              </li>
            ))}
          </ul>
        </figure>
      ) : audience !== "class" && (
        <figure className="min-w-0" aria-labelledby={`question-game-modes-${audience}`}>
          <figcaption
            id={`question-game-modes-${audience}`}
            className="mb-3 text-sm font-bold text-foreground"
          >
            {t("modeCompletionTitle")}
          </figcaption>
          <div role="img" aria-label={t("modeCompletionAria")}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={modes} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="name" stroke={GRID_COLOR} tick={{ fontSize: 11, fill: TICK_COLOR }} />
                <YAxis allowDecimals={false} stroke={GRID_COLOR} tick={{ fontSize: 11, fill: TICK_COLOR }} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "hsl(var(--card-foreground))" }}
                  itemStyle={{ color: "hsl(var(--card-foreground))" }}
                  cursor={{ fill: GRID_COLOR, opacity: 0.3 }}
                />
                <Bar dataKey="plays" name={t("completedGames")} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {modes.map((mode) => <Cell key={mode.mode} fill={MODE_COLORS[mode.mode]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="sr-only">
            {modes.map((mode) => (
              <li key={mode.mode}>
                {t("modeActivitySummary", { mode: mode.name, plays: mode.plays })}
              </li>
            ))}
          </ul>
        </figure>
      )}
    </div>
  );
}
