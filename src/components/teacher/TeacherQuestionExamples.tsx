"use client";

import { useLocale, useTranslations } from "next-intl";
import type { QuestionTeachingGuideItem } from "@/lib/question-teaching-guide-data";
import type { TeachingExampleTopic, TeachingQuestionKind, TeachingText } from "@/lib/question-teaching-examples-types";
import { ClassroomPresentation } from "./ClassroomPresentation";

const questionsForGuide: Record<QuestionTeachingGuideItem["id"], TeachingQuestionKind[]> = {
  twoAxes: ["closed", "conceptual"],
  openClosed: ["closed", "open"],
  factual: ["closed"],
  conceptual: ["conceptual"],
  controversial: ["controversial"],
  comparison: ["closed", "conceptual", "controversial"],
};

export function TeacherQuestionExamples({ guideId, topics }: { guideId: QuestionTeachingGuideItem["id"]; topics: TeachingExampleTopic[] }) {
  const t = useTranslations("questionLearning");
  const locale = useLocale();
  const localize = (value: TeachingText) => locale.toLowerCase().startsWith("en") ? value.en : value.ko;
  if (!topics.length) return null;

  const renderTopic = (topic: TeachingExampleTopic, index: number) => <li key={topic.id} className="min-w-0 rounded-xl border bg-muted/20 p-4">
      <h5 className="text-base font-bold leading-relaxed text-foreground">{t("exampleNumber", { number: index + 1 })} · {localize(topic.subject)} · {localize(topic.unit)}</h5>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{localize(topic.setup)}</p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer rounded py-1 font-medium leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("exampleStandard")} · {topic.standards.map(standard => standard.code).join(" ")}</summary>
        <ul className="mt-2 space-y-2 text-muted-foreground" lang="ko">{topic.standards.map(standard => <li key={standard.code} className="leading-relaxed">{standard.code} {standard.content}</li>)}</ul>
      </details>
      <dl className="mt-4 space-y-3">
        {questionsForGuide[guideId].map(kind => <div key={kind}>
          <dt className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{t(kind === "closed" && ["factual", "comparison"].includes(guideId) ? "exampleFactual" : kind === "closed" && guideId === "twoAxes" ? "exampleClosedFactual" : `exampleQuestion_${kind}`)}</dt>
          <dd className="mt-1 break-words text-base leading-relaxed text-foreground">{localize(topic.questions[kind])}</dd>
        </div>)}
        <div className="border-t pt-3">
          <dt className="text-sm font-semibold text-foreground">{t("exampleActivity")}</dt>
          <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`exampleActivity_${guideId}`)}</dd>
        </div>
      </dl>
      <div className="mt-4"><ClassroomPresentation title={`${localize(topic.subject)} · ${localize(topic.unit)}`} items={questionsForGuide[guideId].map(kind => ({
        id: `${topic.id}:${kind}`, content: localize(topic.questions[kind]),
        classification: t(kind === "closed" && ["factual", "comparison"].includes(guideId) ? "exampleFactual" : kind === "closed" && guideId === "twoAxes" ? "exampleClosedFactual" : `exampleQuestion_${kind}`),
        explanation: t(`exampleActivity_${guideId}`),
      }))} /></div>
    </li>;
  return <ol className="mt-5 space-y-4 border-t pt-4">
    {renderTopic(topics[0], 0)}
    {topics.length > 1 && <li>
      <details key={topics.map(topic => topic.id).join(":")} className="rounded-xl border bg-muted/10 p-3">
        <summary className="min-h-11 cursor-pointer rounded py-2 text-sm font-semibold leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {t("otherExamples")} · {localize(topics[1].subject)} · {localize(topics[1].unit)}
        </summary>
        <ol start={2} className="mt-3 space-y-4">{topics.slice(1).map((topic, index) => renderTopic(topic, index + 1))}</ol>
      </details>
    </li>}
  </ol>;
}
