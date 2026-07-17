"use client";

import { History } from "lucide-react";
import { useLocale } from "next-intl";
import { formatDateOnly } from "@/lib/datetime";
import {
  BUILT_IN_GAMES,
  localizeQuestionGames,
} from "@/lib/question-games-data";
import type {
  QuestionGameHistoryMode,
  QuestionGameLearningHistory as LearningHistory,
} from "@/lib/question-game-history";

interface Props {
  audience: "student" | "teacher";
  history: LearningHistory;
}

export function QuestionGameLearningHistory({ audience, history }: Props) {
  const locale = useLocale();
  const isEnglish = locale === "en";
  const games = new Map(
    localizeQuestionGames(BUILT_IN_GAMES, locale).map((game) => [game.id, game]),
  );
  const modeLabels: Record<QuestionGameHistoryMode, string> = isEnglish
    ? { solo: "Solo", ai: "With AI", friend: "With friends" }
    : { solo: "혼자 하기", ai: "인공지능과 함께", friend: "친구와 함께" };
  const title = isEnglish
    ? audience === "student" ? "My question-game learning history" : "Question-game learning history"
    : audience === "student" ? "나의 질문놀이 학습 이력" : "질문놀이 학습 이력";
  const measures = [
    { label: isEnglish ? "Completed games" : "완료한 놀이", value: history.totals.plays },
    { label: isEnglish ? "Good questions" : "좋은 질문", value: history.totals.goodQuestions },
    { label: isEnglish ? "Points earned" : "받은 포인트", value: history.totals.points },
  ];

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

      <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-3">
        {(["solo", "ai", "friend"] as const).map((mode) => (
          <p className="min-w-0 rounded-md bg-muted px-2 py-1.5 text-center font-semibold text-foreground" key={mode}>
            {modeLabels[mode]} {history.modes[mode].plays}{isEnglish ? "" : "회"}
          </p>
        ))}
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-bold text-foreground">
          {isEnglish ? "Recent completed games" : "최근 완료한 놀이"}
        </h3>
        {history.recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {isEnglish ? "No completed question games yet." : "아직 완료한 질문놀이가 없어요."}
          </p>
        ) : (
          <ol className="mt-2 divide-y divide-border border-y border-border">
            {history.recent.map((item) => {
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
                    {isEnglish
                      ? `${item.goodQuestions} good questions · ${item.points} pts`
                      : `좋은 질문 ${item.goodQuestions}개 · ${item.points}점`}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
