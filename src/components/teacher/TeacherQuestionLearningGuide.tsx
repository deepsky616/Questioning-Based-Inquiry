"use client";

import type { RefObject } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, MessageCircleQuestion, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { questionTeachingGuideForLocale } from "@/lib/question-teaching-guide-data";

interface TeacherQuestionLearningGuideProps {
  titleRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
}

export function TeacherQuestionLearningGuide({
  titleRef,
  onBack,
}: TeacherQuestionLearningGuideProps) {
  const t = useTranslations("questionLearning");
  const locale = useLocale();
  const teachingGuide = questionTeachingGuideForLocale(locale);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            ref={titleRef}
            tabIndex={-1}
            className="text-xl font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
          >
            {t("teachingView")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("teachingGuideDescription")}</p>
        </div>
        <Button variant="outline" className="min-h-11 gap-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("backToLearning")}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {teachingGuide.map((item, index) => (
          <article key={item.id} className="rounded-lg border bg-background p-5">
            <div className="flex items-start gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sm font-black text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <h4 className="pt-1 text-lg font-bold text-foreground">{item.title}</h4>
            </div>

            <dl className="mt-5 space-y-4">
              <div>
                <dt className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Target className="h-4 w-4 text-sky-700 dark:text-sky-300" aria-hidden="true" />
                  {t("objective")}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.objective}</dd>
              </div>
              <div>
                <dt className="text-sm font-bold text-foreground">{t("misconception")}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.misconception}</dd>
              </div>
              <div className="border-l-4 border-emerald-400 pl-3">
                <dt className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <MessageCircleQuestion
                    className="h-4 w-4 text-emerald-700 dark:text-emerald-300"
                    aria-hidden="true"
                  />
                  {t("prompt")}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.prompt}</dd>
              </div>
              <div className="border-l-4 border-rose-400 pl-3">
                <dt className="text-sm font-bold text-foreground">{t("followUp")}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.followUp}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
