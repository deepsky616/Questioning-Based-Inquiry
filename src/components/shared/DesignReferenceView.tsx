"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { splitCoreIdeaLines } from "@/lib/content-selection";
import { StudentInquiryQuestionReference } from "@/components/shared/StudentInquiryQuestionReference";
import type { StudentInquiryGuide } from "@/lib/student-inquiry-guide";
import type { StudentLearningGuides } from "@/lib/student-learning-guide";

export interface DesignReference {
  id?: string;
  title?: string;
  sessionDate?: string | null;
  gradeRange?: string;
  grade?: string | null;
  subject?: string;
  area?: string;
  coreIdea?: string;
  coreSentences?: string[];
  essentialQuestions?: string[];
  learningGuides?: StudentLearningGuides;
  inquiryQuestions?: { type: string; content: string; studentGuide?: StudentInquiryGuide }[];
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
  const sentences = (view.coreSentences ?? []).filter((s) => s.trim());
  const essential = (view.essentialQuestions ?? []).filter((s) => s.trim());
  const inquiry = (view.inquiryQuestions ?? []).filter((q) => q.content.trim());
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

      <div className="mt-2 space-y-3 text-sm">
        {coreIdeaLines.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{t("coreIdea")}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("coreIdeaDesc")}</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-foreground">
              {coreIdeaLines.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
            {learningGuides?.coreIdea && (
              <dl className="mt-2 space-y-2 border-l-4 border-emerald-400 bg-emerald-50/60 px-3 py-2 text-xs dark:bg-emerald-950/20">
                {learningGuides.coreIdea.explanation && <div><dt className="font-semibold">{t("easyExplanation")}</dt><dd className="mt-0.5 text-muted-foreground">{learningGuides.coreIdea.explanation}</dd></div>}
                {learningGuides.coreIdea.lifeConnection && <div><dt className="font-semibold">{t("lifeConnection")}</dt><dd className="mt-0.5 text-muted-foreground">{learningGuides.coreIdea.lifeConnection}</dd></div>}
                {learningGuides.coreIdea.keywords.length > 0 && <div><dt className="font-semibold">{t("keyWords")}</dt><dd className="mt-1 flex flex-wrap gap-1.5">{learningGuides.coreIdea.keywords.map((keyword, index) => <span key={`${keyword.term}-${index}`} className="rounded border border-border bg-background px-2 py-1"><strong>{keyword.term}</strong>{keyword.meaning ? `: ${keyword.meaning}` : ""}</span>)}</dd></div>}
              </dl>
            )}
          </section>
        )}
        {sentences.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{t("coreSentences")}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("coreSentencesDesc")}</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-foreground">
              {sentences.map((s, i) => {
                const guide = learningGuides?.coreSentences.find((item) => item.index === i);
                return <li key={i}>{s}{guide?.explanation && <div className="mt-1 border-l-2 border-blue-300 pl-2 text-xs"><span className="font-semibold">{t("easySentence")}</span><p className="text-muted-foreground">{guide.explanation}</p></div>}</li>;
              })}
            </ul>
          </section>
        )}
        {essential.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{t("essentialQuestions")}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("essentialQuestionsDesc")}</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-foreground">
              {essential.map((s, i) => {
                const guide = learningGuides?.essentialQuestions.find((item) => item.index === i);
                return <li key={i}>{s}{guide && <dl className="mt-1 border-l-2 border-amber-300 pl-2 text-xs">{guide.thinkingFocus && <div><dt className="font-semibold">{t("questionFocus")}</dt><dd className="text-muted-foreground">{guide.thinkingFocus}</dd></div>}{guide.perspectives.length > 0 && <div className="mt-1"><dt className="font-semibold">{t("thinkingPerspectives")}</dt><dd className="mt-0.5 flex flex-wrap gap-1">{guide.perspectives.map((item) => <span key={item} className="rounded border border-border bg-background px-1.5 py-0.5">{item}</span>)}</dd></div>}</dl>}</li>;
              })}
            </ul>
          </section>
        )}
        {inquiry.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{t("inquiryQuestions")}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("inquiryQuestionsDesc")}</p>
            <ul className="mt-2 space-y-2 text-foreground">
              {inquiry.map((q, i) => (
                <StudentInquiryQuestionReference key={i} question={q} typeLabel={typeLabel(q.type)} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
