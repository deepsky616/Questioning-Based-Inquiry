"use client";

import { useEffect, useId, useState } from "react";
import { BookOpenText } from "lucide-react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
  EMPTY_STUDENT_LEARNING_GUIDES,
  type StudentEssentialQuestionGuide,
  type StudentLearningGuides,
} from "@/lib/student-learning-guide";
import { formatInquiryKeywordLines, parseInquiryKeywordLines } from "@/lib/student-inquiry-guide";

function replaceIndexed<T extends { index: number }>(items: T[], index: number, next: T): T[] {
  return [...items.filter((item) => item.index !== index), next].sort((a, b) => a.index - b.index);
}

function PerspectiveEditor({
  id,
  label,
  guide,
  onChange,
}: {
  id: string;
  label: string;
  guide: StudentEssentialQuestionGuide;
  onChange: (guide: StudentEssentialQuestionGuide) => void;
}) {
  const formatted = guide.perspectives.join("\n");
  const [draft, setDraft] = useState(formatted);
  useEffect(() => setDraft(formatted), [formatted]);

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={2}
        value={draft}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        onChange={(event) => {
          setDraft(event.target.value);
          onChange({
            ...guide,
            perspectives: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 3),
          });
        }}
      />
    </div>
  );
}

export function StudentLearningGuideEditor({
  coreSentences,
  essentialQuestions,
  guides,
  onChange,
}: {
  coreSentences: string[];
  essentialQuestions: string[];
  guides?: StudentLearningGuides;
  onChange: (guides: StudentLearningGuides) => void;
}) {
  const t = useTranslations("curriculum");
  const fieldId = useId();
  const current = guides ?? EMPTY_STUDENT_LEARNING_GUIDES;
  const coreIdea = current.coreIdea ?? { explanation: "", lifeConnection: "", keywords: [] };
  const formattedKeywords = formatInquiryKeywordLines(coreIdea.keywords);
  const [keywordDraft, setKeywordDraft] = useState(formattedKeywords);
  useEffect(() => setKeywordDraft(formattedKeywords), [formattedKeywords]);

  return (
    <div className="space-y-3">
      <details className="group border-t border-border pt-3" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpenText className="h-4 w-4" aria-hidden="true" />
          {t("coreIdeaGuideTitle")}
        </summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-1 lg:col-span-2">
            <Label htmlFor={`${fieldId}-core-explanation`}>{t("coreIdeaExplanationLabel")}</Label>
            <textarea
              id={`${fieldId}-core-explanation`}
              rows={2}
              value={coreIdea.explanation}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              onChange={(event) => onChange({ ...current, coreIdea: { ...coreIdea, explanation: event.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${fieldId}-core-life`}>{t("coreIdeaLifeLabel")}</Label>
            <textarea
              id={`${fieldId}-core-life`}
              rows={3}
              value={coreIdea.lifeConnection}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              onChange={(event) => onChange({ ...current, coreIdea: { ...coreIdea, lifeConnection: event.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${fieldId}-core-keywords`}>{t("coreIdeaKeywordsLabel")}</Label>
            <textarea
              id={`${fieldId}-core-keywords`}
              rows={3}
              value={keywordDraft}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              onChange={(event) => {
                setKeywordDraft(event.target.value);
                onChange({ ...current, coreIdea: { ...coreIdea, keywords: parseInquiryKeywordLines(event.target.value) } });
              }}
            />
          </div>
        </div>
      </details>

      {coreSentences.map((sentence, index) => {
        const guide = current.coreSentences.find((item) => item.index === index) ?? { index, explanation: "" };
        return (
          <details key={`sentence-${index}`} className="border-t border-border pt-3">
            <summary className="cursor-pointer text-xs font-semibold text-foreground">
              {t("coreSentenceGuideTitle", { n: index + 1 })} · <span className="font-normal text-muted-foreground">{sentence}</span>
            </summary>
            <div className="mt-2 space-y-1">
              <Label htmlFor={`${fieldId}-sentence-${index}`}>{t("coreSentenceEasyLabel", { n: index + 1 })}</Label>
              <textarea
                id={`${fieldId}-sentence-${index}`}
                rows={2}
                value={guide.explanation}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                onChange={(event) => onChange({
                  ...current,
                  coreSentences: replaceIndexed(current.coreSentences, index, { ...guide, explanation: event.target.value }),
                })}
              />
            </div>
          </details>
        );
      })}

      {essentialQuestions.map((question, index) => {
        const guide = current.essentialQuestions.find((item) => item.index === index) ?? {
          index,
          thinkingFocus: "",
          perspectives: [],
        };
        return (
          <details key={`question-${index}`} className="border-t border-border pt-3">
            <summary className="cursor-pointer text-xs font-semibold text-foreground">
              {t("essentialQuestionGuideTitle", { n: index + 1 })} · <span className="font-normal text-muted-foreground">{question}</span>
            </summary>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`${fieldId}-question-${index}`}>{t("essentialQuestionFocusLabel", { n: index + 1 })}</Label>
                <textarea
                  id={`${fieldId}-question-${index}`}
                  rows={2}
                  value={guide.thinkingFocus}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  onChange={(event) => onChange({
                    ...current,
                    essentialQuestions: replaceIndexed(current.essentialQuestions, index, { ...guide, thinkingFocus: event.target.value }),
                  })}
                />
              </div>
              <PerspectiveEditor
                id={`${fieldId}-perspectives-${index}`}
                label={t("essentialQuestionPerspectivesLabel", { n: index + 1 })}
                guide={guide}
                onChange={(next) => onChange({
                  ...current,
                  essentialQuestions: replaceIndexed(current.essentialQuestions, index, next),
                })}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
}
