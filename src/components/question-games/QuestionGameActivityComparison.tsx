"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  QuestionGameModeSummary,
} from "@/lib/question-game-history";

interface Props {
  audience: "student" | "teacher" | "class";
  gameModes: QuestionGameModeSummary[];
  classStudentCount?: number;
}

interface ModeChartRow {
  gameId: string;
  name: string;
  solo: number;
  ai: number;
  friend: number;
  soloRate: number;
  aiRate: number;
  friendRate: number;
  modes: QuestionGameModeSummary["modes"];
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
const MODES = ["solo", "ai", "friend"] as const;

function participationRate(participants: number, classStudentCount: number) {
  if (classStudentCount <= 0) return 0;
  return Math.min(100, Math.round((participants / classStudentCount) * 100));
}

function ClassParticipationTooltip({
  active,
  payload,
  classStudentCount,
  modes,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ModeChartRow }>;
  classStudentCount: number;
  modes: readonly QuestionGameHistoryMode[];
}) {
  const t = useTranslations("gamePlay");
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const labels: Record<QuestionGameHistoryMode, string> = {
    solo: t("modeSolo"),
    ai: t("modeAi"),
    friend: t("modeFriend"),
  };
  return (
    <div style={TOOLTIP_STYLE} className="max-w-64 p-3 shadow-lg">
      <p className="font-bold text-foreground">{row.name}</p>
      <dl className="mt-2 space-y-1.5">
        {modes.map((mode) => (
          <div className="flex items-start justify-between gap-3" key={mode}>
            <dt className="font-semibold" style={{ color: MODE_COLORS[mode] }}>{labels[mode]}</dt>
            <dd className="text-right text-card-foreground">
              {t("classParticipationTooltip", {
                participants: row.modes[mode].participants,
                rate: participationRate(row.modes[mode].participants, classStudentCount),
                completions: row.modes[mode].completions,
              })}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function QuestionGameActivityComparison({
  audience,
  gameModes,
  classStudentCount = 0,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("gamePlay");
  const [selectedMode, setSelectedMode] = useState<"all" | QuestionGameHistoryMode>("all");
  const games = useMemo(() => localizeQuestionGames(BUILT_IN_GAMES, locale), [locale]);
  const modeLabels: Record<QuestionGameHistoryMode, string> = {
    solo: t("modeSolo"),
    ai: t("modeAi"),
    friend: t("modeFriend"),
  };
  const gameModesById = new Map(gameModes.map((summary) => [summary.gameId, summary]));
  const modeRows = games
    .map((game) => {
      const summary = gameModesById.get(game.id);
      if (!summary || !MODES.some((mode) => (
        summary.modes[mode].plays > 0 ||
        summary.modes[mode].completions > 0 ||
        summary.modes[mode].participants > 0
      ))) return null;
      return {
        gameId: game.id,
        name: game.title,
        solo: summary.modes.solo.completions,
        ai: summary.modes.ai.completions,
        friend: summary.modes.friend.completions,
        soloRate: participationRate(summary.modes.solo.participants, classStudentCount),
        aiRate: participationRate(summary.modes.ai.participants, classStudentCount),
        friendRate: participationRate(summary.modes.friend.participants, classStudentCount),
        modes: summary.modes,
      } satisfies ModeChartRow;
    })
    .filter((row): row is ModeChartRow => row !== null);
  if (audience !== "class") {
    if (modeRows.length === 0) return null;
    return (
      <figure className="min-w-0" aria-labelledby={`question-game-modes-${audience}`}>
        <figcaption
          id={`question-game-modes-${audience}`}
          className="mb-3 text-sm font-bold text-foreground"
        >
          {t("gameModeBreakdownTitle")}
        </figcaption>
        <div role="img" aria-label={t("gameModeBreakdownAria")}>
          <ResponsiveContainer width="100%" height={Math.max(240, modeRows.length * 54)}>
            <BarChart
              data={modeRows}
              layout="vertical"
              margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
              barCategoryGap="22%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                stroke={GRID_COLOR}
                tick={{ fontSize: 11, fill: TICK_COLOR }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={116}
                interval={0}
                stroke={GRID_COLOR}
                tick={{ fontSize: 10, fill: TICK_COLOR }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "hsl(var(--card-foreground))" }}
                itemStyle={{ color: "hsl(var(--card-foreground))" }}
                cursor={{ fill: GRID_COLOR, opacity: 0.3 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {MODES.map((mode) => (
                <Bar
                  key={mode}
                  dataKey={mode}
                  name={modeLabels[mode]}
                  fill={MODE_COLORS[mode]}
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="sr-only">
          {modeRows.map((row) => (
            <li key={row.gameId}>
              {t("individualGameModeSummary", {
                game: row.name,
                solo: row.solo,
                ai: row.ai,
                friend: row.friend,
              })}
            </li>
          ))}
        </ul>
      </figure>
    );
  }

  if (modeRows.length === 0) return null;
  const visibleModes: readonly QuestionGameHistoryMode[] = selectedMode === "all"
    ? MODES
    : [selectedMode];

  return (
    <div className="min-w-0">
      <h3
        id="question-game-participation-class"
        className="mb-3 text-sm font-bold text-foreground"
      >
        {t("gameModeBreakdownTitle")}
      </h3>
      <div
        role="group"
        aria-label={t("modeComparisonLabel")}
        className="mb-3 inline-flex max-w-full flex-wrap rounded-md border border-border bg-muted p-1"
      >
        {(["all", ...MODES] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={selectedMode === mode}
            onClick={() => setSelectedMode(mode)}
            className={`min-h-8 rounded px-3 text-xs font-bold transition-colors ${
              selectedMode === mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode === "all" ? t("allModeComparison") : modeLabels[mode]}
          </button>
        ))}
      </div>

      <figure aria-labelledby="question-game-participation-class">
        <div
          role="img"
          aria-label={selectedMode === "all"
            ? t("classParticipationAria")
            : t("classParticipationModeAria", { mode: modeLabels[selectedMode] })}
        >
          <ResponsiveContainer width="100%" height={Math.max(240, modeRows.length * 54)}>
            <BarChart
              data={modeRows}
              layout="vertical"
              margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
              barCategoryGap="22%"
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
                width={116}
                interval={0}
                stroke={GRID_COLOR}
                tick={{ fontSize: 10, fill: TICK_COLOR }}
              />
              <Tooltip
                content={(
                  <ClassParticipationTooltip
                    classStudentCount={classStudentCount}
                    modes={visibleModes}
                  />
                )}
                cursor={{ fill: GRID_COLOR, opacity: 0.3 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {visibleModes.map((mode) => (
                <Bar
                  key={mode}
                  dataKey={`${mode}Rate`}
                  name={modeLabels[mode]}
                  fill={MODE_COLORS[mode]}
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="sr-only">
          {modeRows.flatMap((row) => visibleModes.map((mode) => (
            <li key={`${row.gameId}-${mode}`}>
              {t("classGameModeSummary", {
                game: row.name,
                mode: modeLabels[mode],
                participants: row.modes[mode].participants,
                rate: participationRate(
                  row.modes[mode].participants,
                  classStudentCount,
                ),
                completions: row.modes[mode].completions,
              })}
            </li>
          )))}
        </ul>
      </figure>

      <div className="mt-4 overflow-x-auto border-t border-border pt-3">
        <table className={`w-full border-collapse text-xs ${
          selectedMode === "all" ? "min-w-[640px]" : "min-w-[360px]"
        }`}>
          <caption className="pb-2 text-left font-bold text-foreground">
            {t("classParticipationTableTitle")}
          </caption>
          <thead>
            <tr className="border-y border-border bg-muted/50 text-foreground">
              <th scope="col" className="px-2 py-2 text-left">{t("questionGame")}</th>
              {visibleModes.map((mode) => (
                <th scope="col" className="px-2 py-2 text-center" key={mode}>
                  {modeLabels[mode]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-foreground">
            {modeRows.map((row) => (
              <tr key={row.gameId}>
                <th scope="row" className="px-2 py-2 text-left font-semibold">{row.name}</th>
                {visibleModes.map((mode) => (
                  <td className="px-2 py-2 text-center" key={mode}>
                    {t("participantCompletionCell", {
                      participants: row.modes[mode].participants,
                      rate: participationRate(
                        row.modes[mode].participants,
                        classStudentCount,
                      ),
                      completions: row.modes[mode].completions,
                    })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
