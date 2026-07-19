"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/datetime";
import {
  BUILT_IN_GAMES,
  localizeQuestionGames,
} from "@/lib/question-games-data";
import type { QuestionGameSettlementHealth } from "@/lib/question-game-settlement-health";

interface Props {
  health: QuestionGameSettlementHealth | null;
  repairing: boolean;
  onRepair: () => void;
}

export function QuestionGameSettlementHealthPanel({
  health,
  repairing,
  onRepair,
}: Props) {
  const t = useTranslations("qPlay");
  const locale = useLocale();
  const tg = useTranslations("gamePlay");
  if (!health) return null;

  const games = new Map(
    localizeQuestionGames(BUILT_IN_GAMES, locale).map((game) => [game.id, game]),
  );
  const issueCount = health.summary.pending + health.summary.failed;
  const issues = health.items.filter(
    ({ status }) => status === "pending" || status === "failed",
  );

  return (
    <section
      aria-labelledby="question-game-settlement-health"
      className="border-y border-border py-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        {issueCount > 0 ? (
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <h2 id="question-game-settlement-health" className="text-sm font-bold text-foreground">
            {t("settlementTitle")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {health.summary.checked === 0
              ? t("settlementEmpty")
              : issueCount === 0
                ? t("settlementHealthy", { count: health.summary.checked })
                : t("settlementNeedsCheck", { count: issueCount })}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={repairing}
          onClick={onRepair}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${repairing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {repairing ? t("settlementRepairing") : t("settlementRepair")}
        </Button>
      </div>

      {issues.length > 0 && (
        <ul className="mt-3 divide-y divide-border border-t border-border text-sm">
          {issues.slice(0, 5).map((item) => (
            <li className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2" key={`${item.code}:${item.completedAt}`}>
              <span className="font-semibold text-foreground">
                {games.get(item.gameId)?.title ?? item.gameId} · {t("settlementRoom", { code: item.code })}
              </span>
              <span className="text-muted-foreground">{formatDateOnly(item.completedAt)}</span>
              {item.reason && (
                <span className="basis-full text-xs text-amber-800 dark:text-amber-200">
                  {item.reason}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
