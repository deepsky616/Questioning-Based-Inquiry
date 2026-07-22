"use client";

import { useEffect, useId, useState } from "react";
import { AlignLeft, CircleHelp, Lightbulb } from "lucide-react";
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
  coreIdea: coreIdeaSource = "",
  coreSentences,
  essentialQuestions,
  guides,
  showEditors = true,
  emptyMessage = "",
  onChange,
}: {
  coreIdea?: string;
  coreSentences: string[];
  essentialQuestions: string[];
  guides?: StudentLearningGuides;
  showEditors?: boolean;
  emptyMessage?: string;
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
    <div className="space-y-4">
      <section
        data-student-guide-section="core-idea"
        className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 dark:border-amber-800/60 dark:bg-amber-950/20 sm:p-4"
        aria-labelledby={`${fieldId}-core-idea-title`}
      >
        <div className="flex items-start gap-3">
          <span data-student-guide-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-200" aria-hidden="true">1</span>
          <div className="min-w-0">
            <h3 id={`${fieldId}-core-idea-title`} className="flex items-center gap-1.5 text-sm font-semibold text-amber-950 dark:text-amber-100">
              <Lightbulb className="h-4 w-4" aria-hidden="true" />
              {t("studentGuideCoreIdeaSectionTitle")}
            </h3>
            <p className="mt-0.5 text-xs leading-5 text-amber-800/80 dark:text-amber-200/75">
              {t("studentGuideCoreIdeaSectionDesc")}
            </p>
          </div>
        </div>
        {coreIdeaSource.trim() && (
          <p
            data-student-guide-source="core-idea"
            className="mt-3 rounded-lg border border-amber-200/70 bg-background/85 px-3 py-3 text-sm font-medium leading-6 text-foreground dark:border-amber-800/50"
          >
            {coreIdeaSource}
          </p>
        )}
        {showEditors ? (
        <div className="mt-4 grid gap-3 border-t border-amber-200/70 pt-4 dark:border-amber-800/50 lg:grid-cols-2">
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
              placeholder={t("coreIdeaKeywordsPlaceholder")}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              onChange={(event) => {
                setKeywordDraft(event.target.value);
                onChange({ ...current, coreIdea: { ...coreIdea, keywords: parseInquiryKeywordLines(event.target.value) } });
              }}
            />
            <p className="text-[11px] leading-4 text-muted-foreground">
              {t("coreIdeaKeywordsHint")}
            </p>
          </div>
        </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-amber-300/70 bg-background/60 px-3 py-3 text-xs text-muted-foreground dark:border-amber-700/60">
            {emptyMessage}
          </p>
        )}
      </section>

      {coreSentences.length > 0 && (
        <section
          data-student-guide-section="core-sentence"
          className="rounded-xl border border-sky-200/80 bg-sky-50/70 p-3.5 dark:border-sky-800/60 dark:bg-sky-950/20 sm:p-4"
          aria-labelledby={`${fieldId}-core-sentence-title`}
        >
          <div className="flex items-start gap-3">
            <span data-student-guide-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800 dark:bg-sky-900/60 dark:text-sky-200" aria-hidden="true">2</span>
            <div className="min-w-0">
              <h3 id={`${fieldId}-core-sentence-title`} className="flex items-center gap-1.5 text-sm font-semibold text-sky-950 dark:text-sky-100">
                <AlignLeft className="h-4 w-4" aria-hidden="true" />
                {t("studentGuideCoreSentenceSectionTitle")}
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-sky-800/80 dark:text-sky-200/75">
                {t("studentGuideCoreSentenceSectionDesc")}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {coreSentences.map((sentence, index) => {
              const guide = current.coreSentences.find((item) => item.index === index) ?? { index, explanation: "" };
              return (
                <article key={`sentence-${index}`} className="rounded-lg border border-sky-200/70 bg-background/85 px-3 py-3 dark:border-sky-800/50">
                  <p data-student-guide-source="core-sentence" className="text-sm font-medium leading-6 text-foreground">
                    {sentence}
                  </p>
                  {showEditors ? (
                  <div className="mt-3 space-y-1 border-t border-sky-200/70 pt-3 dark:border-sky-800/50">
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
                  ) : (
                    <p className="mt-3 rounded-lg border border-dashed border-sky-300/70 bg-background/60 px-3 py-3 text-xs text-muted-foreground dark:border-sky-700/60">
                      {emptyMessage}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {essentialQuestions.length > 0 && (
        <section
          data-student-guide-section="essential-question"
          className="rounded-xl border border-violet-200/80 bg-violet-50/70 p-3.5 dark:border-violet-800/60 dark:bg-violet-950/20 sm:p-4"
          aria-labelledby={`${fieldId}-essential-question-title`}
        >
          <div className="flex items-start gap-3">
            <span data-student-guide-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800 dark:bg-violet-900/60 dark:text-violet-200" aria-hidden="true">3</span>
            <div className="min-w-0">
              <h3 id={`${fieldId}-essential-question-title`} className="flex items-center gap-1.5 text-sm font-semibold text-violet-950 dark:text-violet-100">
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
                {t("studentGuideEssentialQuestionSectionTitle")}
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-violet-800/80 dark:text-violet-200/75">
                {t("studentGuideEssentialQuestionSectionDesc")}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {essentialQuestions.map((question, index) => {
              const guide = current.essentialQuestions.find((item) => item.index === index) ?? {
                index,
                thinkingFocus: "",
                perspectives: [],
              };
              return (
                <article key={`question-${index}`} className="rounded-lg border border-violet-200/70 bg-background/85 px-3 py-3 dark:border-violet-800/50">
                  <p data-student-guide-source="essential-question" className="text-sm font-medium leading-6 text-foreground">
                    {question}
                  </p>
                  {showEditors ? (
                  <div className="mt-3 grid gap-3 border-t border-violet-200/70 pt-3 dark:border-violet-800/50 lg:grid-cols-2">
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
                  ) : (
                    <p className="mt-3 rounded-lg border border-dashed border-violet-300/70 bg-background/60 px-3 py-3 text-xs text-muted-foreground dark:border-violet-700/60">
                      {emptyMessage}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
