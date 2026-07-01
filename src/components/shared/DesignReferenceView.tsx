"use client";

import { useTranslations } from "next-intl";
import { splitCoreIdeaLines } from "@/lib/content-selection";

export interface DesignReference {
  title?: string;
  sessionDate?: string | null;
  gradeRange?: string;
  grade?: string | null;
  subject?: string;
  area?: string;
  coreIdea?: string;
  coreSentences?: string[];
  essentialQuestions?: string[];
  inquiryQuestions?: { type: string; content: string }[];
}

/**
 * 탐구설계 참고자료 표시(학생 질문하기 · 교사 저장 탭 공용).
 * 단원명·학년/교과/영역 메타 + 핵심아이디어·핵심문장·핵심질문·탐구질문을 일관된 레이아웃으로 보여준다.
 */
export function DesignReferenceView({ data, className }: { data: DesignReference; className?: string }) {
  const t = useTranslations("designRef");
  const tCls = useTranslations("classification");
  const typeLabel = (ty: string) =>
    ty === "factual" ? tCls("factual.label")
      : ty === "conceptual" ? tCls("conceptual.label")
      : ty === "controversial" ? tCls("controversial.label")
      : ty;

  // 라벨 통일: 수업날짜·교과·영역 (단원은 제목으로 별도 표시)
  const metaParts = [
    data.sessionDate && `${t("labelDate")} ${data.sessionDate}`,
    data.subject && `${t("labelSubject")} ${data.subject}`,
    data.area && `${t("labelArea")} ${data.area}`,
  ].filter(Boolean);
  const coreIdeaLines = splitCoreIdeaLines(data.coreIdea ?? "");
  const sentences = (data.coreSentences ?? []).filter((s) => s.trim());
  const essential = (data.essentialQuestions ?? []).filter((s) => s.trim());
  const inquiry = (data.inquiryQuestions ?? []).filter((q) => q.content.trim());

  return (
    <div className={className}>
      {data.title && (
        <p className="text-sm font-semibold text-foreground">
          <span className="mr-1 text-xs font-medium text-muted-foreground">{t("labelUnit")}</span>
          {data.title}
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
            <ul className="mt-0.5 space-y-1 text-foreground">
              {inquiry.map((q, i) => (
                <li key={i}>
                  <span className="mr-1 font-medium text-indigo-600 dark:text-indigo-400">[{typeLabel(q.type)}]</span>
                  {q.content}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
