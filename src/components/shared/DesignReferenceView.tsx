"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { splitCoreIdeaLines } from "@/lib/content-selection";
import { StudentInquiryQuestionReference } from "@/components/shared/StudentInquiryQuestionReference";
import type { StudentInquiryGuide } from "@/lib/student-inquiry-guide";

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
          </section>
        )}
        {sentences.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{t("coreSentences")}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("coreSentencesDesc")}</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-foreground">
              {sentences.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </section>
        )}
        {essential.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{t("essentialQuestions")}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("essentialQuestionsDesc")}</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-foreground">
              {essential.map((s, i) => <li key={i}>{s}</li>)}
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
