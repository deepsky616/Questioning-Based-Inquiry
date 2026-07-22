"use client";

import { useEffect, useId, useState } from "react";
import { BookOpenText } from "lucide-react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
  EMPTY_STUDENT_INQUIRY_GUIDE,
  formatInquiryKeywordLines,
  parseInquiryKeywordLines,
  type StudentInquiryGuide,
} from "@/lib/student-inquiry-guide";

export function StudentInquiryGuideEditor({
  guide,
  defaultOpen = false,
  onChange,
}: {
  guide?: StudentInquiryGuide;
  defaultOpen?: boolean;
  onChange: (guide: StudentInquiryGuide) => void;
}) {
  const t = useTranslations("curriculum");
  const current = guide ?? EMPTY_STUDENT_INQUIRY_GUIDE;
  const fieldId = useId();
  const formattedKeywords = formatInquiryKeywordLines(current.keywords);
  const [keywordDraft, setKeywordDraft] = useState(formattedKeywords);

  useEffect(() => {
    setKeywordDraft(formattedKeywords);
  }, [formattedKeywords]);

  return (
    <details data-student-inquiry-guide-editor open={defaultOpen} className="group border-t border-current/15 pt-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-foreground">
        <BookOpenText className="h-4 w-4" aria-hidden="true" />
        {t("studentGuideTitle")}
        <span className="ml-auto text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor={`${fieldId}-meaning`}>{t("studentGuideMeaningLabel")}</Label>
          <textarea
            id={`${fieldId}-meaning`}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={current.meaning}
            placeholder={t("studentGuideMeaningPlaceholder")}
            onChange={(event) => onChange({ ...current, meaning: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-keywords`}>{t("studentGuideKeywordsLabel")}</Label>
          <textarea
            id={`${fieldId}-keywords`}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={keywordDraft}
            placeholder={t("studentGuideKeywordsPlaceholder")}
            onChange={(event) => {
              setKeywordDraft(event.target.value);
              onChange({ ...current, keywords: parseInquiryKeywordLines(event.target.value) });
            }}
          />
          <p className="text-[11px] text-muted-foreground">{t("studentGuideKeywordsHint")}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-thinking`}>{t("studentGuideThinkingLabel")}</Label>
          <textarea
            id={`${fieldId}-thinking`}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={current.thinkingStart}
            placeholder={t("studentGuideThinkingPlaceholder")}
            onChange={(event) => onChange({ ...current, thinkingStart: event.target.value })}
          />
        </div>
      </div>
    </details>
  );
}
