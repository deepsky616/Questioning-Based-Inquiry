"use client";

import { useEffect, useState } from "react";
import { AlignLeft, BadgeCheck, CircleHelp, Lightbulb, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { splitCoreIdeaLines } from "@/lib/content-selection";
import { StudentInquiryQuestionReference } from "@/components/shared/StudentInquiryQuestionReference";
import type { Achievement } from "@/lib/achievement-selection";
import type { StudentInquiryGuide } from "@/lib/student-inquiry-guide";
import type { StudentLearningGuides } from "@/lib/student-learning-guide";

export interface DesignReferenceInquiryQuestion {
  type: string;
  content: string;
  studentGuide?: StudentInquiryGuide;
  contentGroup?: string;
  priority?: number;
  source?: "student" | "teacher";
  mergedFrom?: string[];
}

export interface DesignReference {
  id?: string;
  title?: string;
  sessionDate?: string | null;
  gradeRange?: string;
  grade?: string | null;
  subject?: string;
  area?: string;
  coreIdea?: string;
  achievements?: Achievement[];
  coreSentences?: string[];
  essentialQuestions?: string[];
  learningGuides?: StudentLearningGuides;
  inquiryQuestions?: DesignReferenceInquiryQuestion[];
}

/**
 * 탐구설계 참고자료 표시(학생 질문하기 · 교사 저장 탭 공용).
 * 단원명·학년/교과/영역 메타 + 핵심아이디어·핵심문장·핵심질문·탐구질문을 일관된 레이아웃으로 보여준다.
 */
export function DesignReferenceView({
  data,
  className,
  sourceSessionId,
}: {
  data: DesignReference;
  className?: string;
  sourceSessionId?: string | null;
}) {
  const t = useTranslations("designRef");
  const tCls = useTranslations("classification");
  const locale = useLocale();
  const [translated, setTranslated] = useState<DesignReference | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTranslated(null);
    if (locale === "ko" || !sourceSessionId) return;

    fetch(`/api/sessions/${sourceSessionId}/design-context/translate`, { method: "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload?.context) setTranslated(payload.context as DesignReference);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [locale, sourceSessionId]);

  const view = translated ?? data;
  const typeLabel = (ty: string) =>
    ty === "factual" ? tCls("factual.label")
      : ty === "conceptual" ? tCls("conceptual.label")
      : ty === "controversial" ? tCls("controversial.label")
      : ty;

  // 라벨 통일: 수업날짜·교과·영역 (단원은 제목으로 별도 표시)
  const metaParts = [
    view.sessionDate && `${t("labelDate")} ${view.sessionDate}`,
    view.subject && `${t("labelSubject")} ${view.subject}`,
    view.area && `${t("labelArea")} ${view.area}`,
  ].filter(Boolean);
  const coreIdeaLines = splitCoreIdeaLines(view.coreIdea ?? "");
  const achievements = (view.achievements ?? []).filter((achievement) => (
    achievement.code.trim() || achievement.content.trim()
  ));
  const hasAchievements = achievements.length > 0;
  const sentences = (view.coreSentences ?? []).filter((s) => s.trim());
  const essential = (view.essentialQuestions ?? []).filter((s) => s.trim());
  const inquiry = (view.inquiryQuestions ?? [])
    .filter((q) => q.content.trim())
    .map((question, index) => ({
      question,
      order: typeof question.priority === "number" ? question.priority : index + 1,
    }))
    .sort((a, b) => a.order - b.order);
  const hasInquiryGroups = inquiry.some(({ question }) => question.contentGroup?.trim());
  const inquiryGroups = inquiry.reduce<
    { label: string; items: typeof inquiry }[]
  >((groups, item) => {
    const label = hasInquiryGroups
      ? item.question.contentGroup?.trim() || t("inquiryQuestions")
      : "";
    const previous = groups[groups.length - 1];
    if (previous?.label === label) {
      previous.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
    return groups;
  }, []);
  const learningGuides = view.learningGuides;

  return (
    <div className={className}>
      {view.title && (
        <p className="text-sm font-semibold text-foreground">
          <span className="mr-1 text-xs font-medium text-muted-foreground">{t("labelUnit")}</span>
          {view.title}
        </p>
      )}
      {metaParts.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{metaParts.join(" · ")}</p>}

      <div className="mt-3 space-y-3 text-sm">
        {coreIdeaLines.length > 0 && (
          <section
            data-design-reference-section="core-idea"
            className="rounded-lg border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-800/60 dark:bg-amber-950/20"
          >
            <div className="flex items-start gap-2.5">
              <span data-design-reference-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200" aria-hidden="true">1</span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-950 dark:text-amber-100">
                  <Lightbulb className="h-4 w-4" aria-hidden="true" />
                  {t("coreIdea")}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-amber-800/80 dark:text-amber-200/75">{t("coreIdeaDesc")}</p>
              </div>
            </div>
            <article className="mt-3 rounded-md border border-amber-200/70 bg-background/85 p-3 dark:border-amber-800/50">
              <ul className="list-disc space-y-0.5 pl-5 text-foreground">
                {coreIdeaLines.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
              {learningGuides?.coreIdea && (
                <dl data-student-understanding-guide="core-idea" className="mt-3 space-y-2 border-t border-amber-200/70 pt-3 text-xs dark:border-amber-800/50">
                  {learningGuides.coreIdea.explanation && <div><dt className="font-semibold">{t("easyExplanation")}</dt><dd className="mt-0.5 leading-relaxed text-muted-foreground">{learningGuides.coreIdea.explanation}</dd></div>}
                  {learningGuides.coreIdea.lifeConnection && <div><dt className="font-semibold">{t("lifeConnection")}</dt><dd className="mt-0.5 leading-relaxed text-muted-foreground">{learningGuides.coreIdea.lifeConnection}</dd></div>}
                  {learningGuides.coreIdea.keywords.length > 0 && <div><dt className="font-semibold">{t("keyWords")}</dt><dd className="mt-1 flex flex-wrap gap-1.5">{learningGuides.coreIdea.keywords.map((keyword, index) => <span key={`${keyword.term}-${index}`} className="rounded border border-border bg-background px-2 py-1"><strong>{keyword.term}</strong>{keyword.meaning ? `: ${keyword.meaning}` : ""}</span>)}</dd></div>}
                </dl>
              )}
            </article>
          </section>
        )}
        {hasAchievements && (
          <section
            data-design-reference-section="achievement"
            className="rounded-lg border border-teal-200/80 bg-teal-50/70 p-3 dark:border-teal-800/60 dark:bg-teal-950/20"
          >
            <div className="flex items-start gap-2.5">
              <span data-design-reference-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800 dark:bg-teal-900/60 dark:text-teal-200" aria-hidden="true">2</span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-950 dark:text-teal-100">
                  <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                  {t("achievements")}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-teal-800/80 dark:text-teal-200/75">{t("achievementsDesc")}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {achievements.map((achievement, index) => {
                const guide = learningGuides?.achievements?.find((item) => item.index === index);
                return (
                  <article key={`${achievement.code}-${index}`} className="rounded-md border border-teal-200/70 bg-background/85 p-3 dark:border-teal-800/50">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                      <span className="shrink-0 font-semibold text-teal-800 dark:text-teal-200">{achievement.code}</span>
                      <p className="leading-relaxed text-foreground">{achievement.content}</p>
                    </div>
                    {guide?.explanation && (
                      <div data-student-understanding-guide="achievement" className="mt-3 border-t border-teal-200/70 pt-3 text-xs dark:border-teal-800/50">
                        <p className="font-semibold">{t("easyExplanation")}</p>
                        <p className="mt-0.5 leading-relaxed text-muted-foreground">{guide.explanation}</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
        {sentences.length > 0 && (
          <section
            data-design-reference-section="core-sentence"
            className="rounded-lg border border-sky-200/80 bg-sky-50/70 p-3 dark:border-sky-800/60 dark:bg-sky-950/20"
          >
            <div className="flex items-start gap-2.5">
              <span data-design-reference-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800 dark:bg-sky-900/60 dark:text-sky-200" aria-hidden="true">{hasAchievements ? 3 : 2}</span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-950 dark:text-sky-100">
                  <AlignLeft className="h-4 w-4" aria-hidden="true" />
                  {t("coreSentences")}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-sky-800/80 dark:text-sky-200/75">{t("coreSentencesDesc")}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {sentences.map((sentence, index) => {
                const guide = learningGuides?.coreSentences.find((item) => item.index === index);
                return (
                  <article key={index} className="rounded-md border border-sky-200/70 bg-background/85 p-3 dark:border-sky-800/50">
                    <p className="font-medium leading-relaxed text-foreground">{sentence}</p>
                    {guide?.explanation && (
                      <div data-student-understanding-guide="core-sentence" className="mt-3 border-t border-sky-200/70 pt-3 text-xs dark:border-sky-800/50">
                        <p className="font-semibold">{t("easySentence")}</p>
                        <p className="mt-0.5 leading-relaxed text-muted-foreground">{guide.explanation}</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
        {essential.length > 0 && (
          <section
            data-design-reference-section="essential-question"
            className="rounded-lg border border-violet-200/80 bg-violet-50/70 p-3 dark:border-violet-800/60 dark:bg-violet-950/20"
          >
            <div className="flex items-start gap-2.5">
              <span data-design-reference-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800 dark:bg-violet-900/60 dark:text-violet-200" aria-hidden="true">{hasAchievements ? 4 : 3}</span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-950 dark:text-violet-100">
                  <CircleHelp className="h-4 w-4" aria-hidden="true" />
                  {t("essentialQuestions")}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-violet-800/80 dark:text-violet-200/75">{t("essentialQuestionsDesc")}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {essential.map((question, index) => {
                const guide = learningGuides?.essentialQuestions.find((item) => item.index === index);
                return (
                  <article key={index} className="rounded-md border border-violet-200/70 bg-background/85 p-3 dark:border-violet-800/50">
                    <p className="font-medium leading-relaxed text-foreground">{question}</p>
                    {guide && (
                      <dl data-student-understanding-guide="essential-question" className="mt-3 space-y-2 border-t border-violet-200/70 pt-3 text-xs dark:border-violet-800/50">
                        {guide.thinkingFocus && <div><dt className="font-semibold">{t("questionFocus")}</dt><dd className="mt-0.5 leading-relaxed text-muted-foreground">{guide.thinkingFocus}</dd></div>}
                        {guide.perspectives.length > 0 && <div><dt className="font-semibold">{t("thinkingPerspectives")}</dt><dd className="mt-1 flex flex-wrap gap-1">{guide.perspectives.map((item) => <span key={item} className="rounded border border-border bg-background px-1.5 py-0.5">{item}</span>)}</dd></div>}
                      </dl>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
        {inquiry.length > 0 && (
          <section
            data-design-reference-section="inquiry-question"
            className="rounded-lg border border-emerald-200/80 bg-emerald-50/70 p-3 dark:border-emerald-800/60 dark:bg-emerald-950/20"
          >
            <div className="flex items-start gap-2.5">
              <span data-design-reference-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200" aria-hidden="true">{hasAchievements ? 5 : 4}</span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-950 dark:text-emerald-100">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  {t("inquiryQuestions")}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-emerald-800/80 dark:text-emerald-200/75">{t("inquiryQuestionsDesc")}</p>
              </div>
            </div>
            <div className="mt-3 space-y-3">
              {inquiryGroups.map((group, groupIndex) => (
                <div key={`${group.label}-${groupIndex}`} className="space-y-2">
                  {group.label && (
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                      {group.label}
                    </p>
                  )}
                  <ul className="space-y-2 text-foreground">
                    {group.items.map(({ question, order }) => (
                      <StudentInquiryQuestionReference
                        key={`${question.content}-${order}`}
                        question={question}
                        typeLabel={typeLabel(question.type)}
                        sequenceNumber={order}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
