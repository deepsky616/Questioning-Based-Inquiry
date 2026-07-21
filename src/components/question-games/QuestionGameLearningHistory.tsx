"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, History, LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatDateOnly } from "@/lib/datetime";
import {
  BUILT_IN_GAMES,
  localizeQuestionGames,
} from "@/lib/question-games-data";
import type {
  QuestionGameHistoryItem,
  QuestionGameHistoryMode,
  QuestionGameHistoryPage,
  QuestionGameLearningHistory as LearningHistory,
} from "@/lib/question-game-history";
import {
  QuestionGameLearningCharts,
  type QuestionGameCompletionComparison,
} from "@/components/question-games/QuestionGameLearningCharts";

interface Props {
  audience: "student" | "teacher" | "class";
  history: LearningHistory;
  studentId?: string;
  gameComparison?: QuestionGameCompletionComparison[];
}

const PAGE_SIZE = 8;

export function QuestionGameLearningHistory({
  audience,
  history,
  studentId,
  gameComparison,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("gamePlay");
  const isEnglish = locale === "en";
  const games = useMemo(() => new Map(
    localizeQuestionGames(BUILT_IN_GAMES, locale).map((game) => [game.id, game]),
  ), [locale]);
  const modeLabels: Record<QuestionGameHistoryMode, string> = {
    solo: t("modeSolo"),
    ai: t("modeAi"),
    friend: t("modeFriend"),
  };
  const title = audience === "student"
    ? t("historyTitleStudent")
    : audience === "class"
      ? t("historyTitleClass")
      : t("historyTitle");
  const measures = [
    { label: t("completedGames"), value: history.totals.plays },
    { label: t("goodQuestions"), value: history.totals.goodQuestions },
    { label: t("pointsEarned"), value: history.totals.points },
  ];
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"all" | QuestionGameHistoryMode>("all");
  const [gameId, setGameId] = useState("all");
  const [items, setItems] = useState<QuestionGameHistoryItem[]>(history.recent);
  const [nextCursor, setNextCursor] = useState<string | null>(history.nextCursor ?? null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  async function loadPage(cursor?: string) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (mode !== "all") params.set("mode", mode);
    if (gameId !== "all") params.set("gameId", gameId);
    if (studentId) params.set("studentId", studentId);
    params.set("limit", String(PAGE_SIZE));
    if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/reports/question-games?${params.toString()}`);
      const data: QuestionGameHistoryPage | { error?: string } = await response.json();
      if (!response.ok || !("items" in data) || !Array.isArray(data.items)) {
        throw new Error("error" in data && data.error
          ? data.error
          : t("couldNotLoadHistory"));
      }
      if (requestId !== requestIdRef.current) return;
      setItems((current) => cursor ? [...current, ...data.items] : data.items);
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(error instanceof Error
        ? error.message
        : t("couldNotLoadHistory"));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!expanded || audience === "class") return;
    const timer = window.setTimeout(() => {
      void loadPage();
    }, 50);
    return () => window.clearTimeout(timer);
    // 필터와 대상이 달라질 때 첫 페이지부터 다시 가져온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, expanded, gameId, mode, studentId]);

  function renderItems(rows: QuestionGameHistoryItem[]) {
    if (rows.length === 0) {
      return (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("noCompletedQuestionGamesFound")}
        </p>
      );
    }
    return (
      <ol className="mt-2 divide-y divide-border border-y border-border">
        {rows.map((item) => {
          const game = games.get(item.gameId);
          return (
            <li className="flex min-w-0 items-center gap-3 py-2.5 text-sm" key={item.id}>
              <span className="text-lg" aria-hidden="true">{game?.emoji ?? "🎮"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-foreground">{game?.title ?? item.gameId}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {modeLabels[item.mode]} · {formatDateOnly(item.completedAt)}
                </p>
              </div>
              <p className="shrink-0 text-right text-xs font-semibold text-foreground">
                {t("goodquestionsGoodQuestionsPointsPts", { goodQuestions: item.goodQuestions, points: item.points })}
              </p>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm" aria-labelledby={`question-game-history-${audience}`}>
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-indigo-700 dark:text-indigo-300" aria-hidden="true" />
        <h2 id={`question-game-history-${audience}`} className="text-sm font-black text-foreground">
          {title}
        </h2>
      </div>

      <dl className="mt-3 grid grid-cols-3 divide-x divide-border border-y border-border py-3">
        {measures.map(({ label, value }) => (
          <div className="min-w-0 px-2 text-center first:pl-0 last:pr-0" key={label}>
            <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-lg font-black text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <QuestionGameLearningCharts
        audience={audience}
        history={history}
        gameComparison={gameComparison}
      />

      <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-3">
        {(["solo", "ai", "friend"] as const).map((itemMode) => (
          <p className="min-w-0 rounded-md bg-muted px-2 py-1.5 text-center font-semibold text-foreground" key={itemMode}>
            {modeLabels[itemMode]} {history.modes[itemMode].plays}{t("text2")}
          </p>
        ))}
      </div>

      {audience !== "class" && (
        <>
          {!expanded && (
            <div className="mt-4">
              <h3 className="text-xs font-bold text-foreground">
                {t("recentCompletedGames")}
              </h3>
              {history.recent.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("noCompletedQuestionGamesYet")}
                </p>
              ) : renderItems(history.recent)}
            </div>
          )}

          <button
            type="button"
            className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expanded
              ? t("hideFullHistory")
              : t("viewFullHistory")}
          </button>

          {expanded && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-foreground">
                  {t("playMode")}
                  <select
                    className="mt-1 block min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground"
                    value={mode}
                    onChange={(event) => {
                      setMode(event.target.value as "all" | QuestionGameHistoryMode);
                      setItems([]);
                      setNextCursor(null);
                    }}
                  >
                    <option value="all">{t("allModes")}</option>
                    {(["solo", "ai", "friend"] as const).map((itemMode) => (
                      <option value={itemMode} key={itemMode}>{modeLabels[itemMode]}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold text-foreground">
                  {t("questionGame")}
                  <select
                    className="mt-1 block min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground"
                    value={gameId}
                    onChange={(event) => {
                      setGameId(event.target.value);
                      setItems([]);
                      setNextCursor(null);
                    }}
                  >
                    <option value="all">{t("allGames")}</option>
                    {[...games.values()].map((game) => (
                      <option value={game.id} key={game.id}>{game.title}</option>
                    ))}
                  </select>
                </label>
              </div>

              {loading && items.length === 0 ? (
                <p role="status" className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {t("loadingHistory")}
                </p>
              ) : renderItems(items)}
              {loadError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-300">{loadError}</p>}
              {nextCursor && (
                <button
                  type="button"
                  disabled={loading}
                  className="mt-3 inline-flex min-h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-60"
                  onClick={() => void loadPage(nextCursor)}
                >
                  {loading
                    ? t("loading")
                    : t("loadMore")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
