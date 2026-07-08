"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildSessionLabel } from "@/lib/sessions";
import type { QuestionSession } from "./types";

interface StudentAskCompletionCardProps {
  selectedSession: QuestionSession | null;
  onViewMyQuestions: () => void;
  onWriteAnother: () => void;
  onChooseAnotherSession: () => void;
}

export function StudentAskCompletionCard({
  selectedSession,
  onViewMyQuestions,
  onWriteAnother,
  onChooseAnotherSession,
}: StudentAskCompletionCardProps) {
  const t = useTranslations("ask");

  return (
    <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/30">
      <CardHeader>
        <CardTitle className="text-emerald-800 dark:text-emerald-100">{t("saveCompleteTitle")}</CardTitle>
        <CardDescription className="text-emerald-700 dark:text-emerald-200">
          {selectedSession
            ? t("saveCompleteDescWithSession", { session: buildSessionLabel(selectedSession.date, selectedSession.subject, selectedSession.topic) })
            : t("saveCompleteDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        <Button type="button" variant="gradient" className="h-11" onClick={onViewMyQuestions}>
          {t("viewMyQuestions")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-100"
          onClick={onWriteAnother}
        >
          {t("writeMoreSameSession")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-100"
          onClick={onChooseAnotherSession}
        >
          {t("chooseAnotherSession")}
        </Button>
      </CardContent>
    </Card>
  );
}
