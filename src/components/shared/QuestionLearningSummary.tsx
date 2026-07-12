"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionToggle } from "@/components/shared/SectionToggle";
import {
  QUESTION_ANSWER_RANGE_GUIDE,
  QUESTION_CLASSIFICATION_AXES,
  QUESTION_TYPE_FORMULA_GUIDE,
  QUESTION_WORD_HINT,
} from "@/lib/question-detective-content";

export interface QuestionLearningSummaryProps {
  detailsHref: string;
}

type QuestionTypeKey = (typeof QUESTION_TYPE_FORMULA_GUIDE)[number]["typeKey"];

const TYPE_ACCENT: Record<QuestionTypeKey, string> = {
  factual:
    "border-sky-200 bg-sky-50/70 text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200",
  conceptual:
    "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200",
  controversial:
    "border-rose-200 bg-rose-50/70 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200",
};

export function QuestionLearningSummary({ detailsHref }: QuestionLearningSummaryProps) {
  const t = useTranslations("questionLearning");
  const tCls = useTranslations("classification");
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardContent className="pt-6">
        <SectionToggle
          title={t("summaryTitle")}
          open={open}
          onToggle={() => setOpen((value) => !value)}
          className="min-h-11 w-full text-left"
        />
        {open && (
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-muted-foreground">
              {QUESTION_CLASSIFICATION_AXES.map((axis) => `${axis.title}: ${axis.description}`).join(" · ")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{QUESTION_ANSWER_RANGE_GUIDE.closed.title}</span>{" "}
                {QUESTION_ANSWER_RANGE_GUIDE.closed.definition}
              </p>
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{QUESTION_ANSWER_RANGE_GUIDE.open.title}</span>{" "}
                {QUESTION_ANSWER_RANGE_GUIDE.open.definition}
              </p>
            </div>
            <p className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground">{QUESTION_WORD_HINT}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {QUESTION_TYPE_FORMULA_GUIDE.map((guide) => (
                <article key={guide.typeKey} className={`rounded-lg border p-3 ${TYPE_ACCENT[guide.typeKey]}`}>
                  <h3 className="font-semibold">{tCls(`${guide.typeKey}.label`)}</h3>
                  <p className="mt-1 opacity-80">{guide.tagline}</p>
                  <p className="mt-2 text-xs opacity-80">{guide.formulas[0].examples[0]}</p>
                </article>
              ))}
            </div>
            <Button asChild variant="outline" className="h-11">
              <Link href={detailsHref}>{t("viewFull")}</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
