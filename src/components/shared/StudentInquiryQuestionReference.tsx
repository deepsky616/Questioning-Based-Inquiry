"use client";

import { useTranslations } from "next-intl";

import type { StudentInquiryGuide } from "@/lib/student-inquiry-guide";

const TYPE_STYLE: Record<string, string> = {
  factual: "border-blue-400 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-950/20",
  conceptual: "border-emerald-400 bg-emerald-50/70 dark:border-emerald-400 dark:bg-emerald-950/20",
  controversial: "border-amber-400 bg-amber-50/70 dark:border-amber-400 dark:bg-amber-950/20",
};

export interface StudentInquiryQuestionReferenceData {
  type: string;
  content: string;
  studentGuide?: StudentInquiryGuide;
}

export function StudentInquiryQuestionReference({
  question,
  typeLabel,
  sequenceNumber,
}: {
  question: StudentInquiryQuestionReferenceData;
  typeLabel: string;
  sequenceNumber?: number;
}) {
  const t = useTranslations("designRef");
  const guide = question.studentGuide;
  const typeHelp = question.type === "factual"
    ? t("typeHelpFactual")
    : question.type === "conceptual"
      ? t("typeHelpConceptual")
      : question.type === "controversial"
        ? t("typeHelpControversial")
        : "";

  return (
    <li data-design-reference-inquiry-item className={`rounded-md border border-l-4 px-3 py-2.5 ${TYPE_STYLE[question.type] ?? "border-muted bg-muted/30"}`}>
      <p className="text-sm font-semibold leading-relaxed text-foreground">
        {typeof sequenceNumber === "number" && (
          <span className="mr-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            {sequenceNumber}.
          </span>
        )}
        <span className="mr-1.5 text-xs font-medium text-muted-foreground">[{typeLabel}]</span>
        {question.content}
      </p>
      {typeHelp && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{typeHelp}</p>}
      {guide && (
        <dl data-student-understanding-guide="inquiry-question" className="mt-2 space-y-2 border-t border-border/70 pt-2 text-xs">
          {guide.meaning && (
            <div>
              <dt className="font-semibold text-foreground">{t("questionMeaning")}</dt>
              <dd className="mt-0.5 leading-relaxed text-muted-foreground">{guide.meaning}</dd>
            </div>
          )}
          {guide.keywords.length > 0 && (
            <div>
              <dt className="font-semibold text-foreground">{t("keyWords")}</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {guide.keywords.map((keyword, index) => (
                  <span key={`${keyword.term}-${index}`} className="rounded border border-border bg-background px-2 py-1 text-foreground">
                    <strong>{keyword.term}</strong>{keyword.meaning ? `: ${keyword.meaning}` : ""}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {guide.thinkingStart && (
            <div>
              <dt className="font-semibold text-foreground">{t("thinkingStart")}</dt>
              <dd className="mt-0.5 leading-relaxed text-muted-foreground">{guide.thinkingStart}</dd>
            </div>
          )}
        </dl>
      )}
    </li>
  );
}
