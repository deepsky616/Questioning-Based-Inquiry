"use client";

import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Lightbulb } from "lucide-react";
import {
  buildQuestionGameLearningSummary,
  type QuestionGameLearningNextStep,
  type QuestionGameLearningStrength,
  type QuestionGameMode,
} from "@/lib/question-game-learning-summary";

interface Props {
  mode: QuestionGameMode;
  completedActivities: number;
  questions: string[];
  points?: number;
  accentColor?: string;
  embedded?: boolean;
}

const STRENGTH_KEY: Record<QuestionGameLearningStrength, string> = {
  completed: "strengthCompleted",
  startedQuestions: "strengthStartedQuestions",
  clearQuestion: "strengthClearQuestion",
  variedQuestions: "strengthVariedQuestions",
};

const NEXT_STEP_KEY: Record<QuestionGameLearningNextStep, string> = {
  explainConnection: "nextExplainConnection",
  clarifyQuestionForm: "nextClarifyQuestionForm",
  expandThinking: "nextExpandThinking",
  changePerspective: "nextChangePerspective",
};

export function GameLearningSummary({
  mode,
  completedActivities,
  questions,
  points,
  accentColor = "#4f46e5",
  embedded = false,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("gamePlay");
  const isEnglish = locale === "en";
  const summary = buildQuestionGameLearningSummary(questions, completedActivities);
  const modeLabels: Record<QuestionGameMode, string> = {
    solo: t("modeSolo"),
    ai: t("modeAi"),
    friend: t("modeFriend"),
  };
  const strength = t(STRENGTH_KEY[summary.strength], {
    count: summary.validQuestionCount,
  });
  const nextStep = t(NEXT_STEP_KEY[summary.nextStep]);

  const measures = [
    {
      label: t("activities"),
      value: completedActivities,
    },
    {
      label: t("questions4"),
      value: questions.filter((question) => question.trim()).length,
    },
    ...(typeof points === "number" ? [{
      label: t("points"),
      value: points,
    }] : []),
  ];

  return (
    <section className={embedded
      ? "border-y border-border py-5 text-foreground"
      : "rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm"
    }>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-black text-foreground">
          {t("myQuestionLearningResult")}
        </h2>
        <span
          className="rounded-full border px-2.5 py-1 text-xs font-bold text-foreground"
          style={{ borderColor: accentColor }}
        >
          {modeLabels[mode]}
        </span>
      </div>

      <dl className={`mt-4 grid ${measures.length === 3 ? "grid-cols-3" : "grid-cols-2"} divide-x divide-border border-y border-border py-3`}>
        {measures.map(({ label, value }) => (
          <div className="min-w-0 px-2 text-center first:pl-0 last:pr-0" key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-black text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} aria-hidden="true" />
          <div>
            <p className="font-bold text-foreground">{t("whatWentWell")}</p>
            <p className="mt-0.5 leading-6 text-muted-foreground">{strength}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 border-t border-border pt-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} aria-hidden="true" />
          <div>
            <p className="font-bold text-foreground">{t("nextPractice")}</p>
            <p className="mt-0.5 leading-6 text-muted-foreground">{nextStep}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
