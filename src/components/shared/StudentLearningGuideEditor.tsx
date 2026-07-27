"use client";

import { useEffect, useId, useState } from "react";
import { AlignLeft, BadgeCheck, CircleHelp, Lightbulb, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Achievement } from "@/lib/achievement-selection";
import {
  EMPTY_STUDENT_LEARNING_GUIDES,
  type StudentEssentialQuestionGuide,
  type StudentLearningGuides,
} from "@/lib/student-learning-guide";
import { formatInquiryKeywordLines, parseInquiryKeywordLines } from "@/lib/student-inquiry-guide";

function replaceIndexed<T extends { index: number }>(items: T[], index: number, next: T): T[] {
  return [...items.filter((item) => item.index !== index), next].sort((a, b) => a.index - b.index);
}

export interface StudentLearningGuideSourceEditor {
  onCoreIdeaChange: (value: string) => void;
  onCoreSentenceChange: (index: number, value: string) => void;
  onCoreSentenceRemove: (index: number) => void;
  onCoreSentenceAdd: () => void;
  onEssentialQuestionChange: (index: number, value: string) => void;
  onEssentialQuestionRemove: (index: number) => void;
  onEssentialQuestionAdd: () => void;
}

export interface AchievementSourceEditor {
  onChange: (index: number, value: Achievement) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
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
  achievements = [],
  coreSentences,
  essentialQuestions,
  guides,
  showEditors = true,
  emptyMessage = "",
  sourceEditor,
  achievementEditor,
  onChange,
}: {
  coreIdea?: string;
  achievements?: Achievement[];
  coreSentences: string[];
  essentialQuestions: string[];
  guides?: StudentLearningGuides;
  showEditors?: boolean;
  emptyMessage?: string;
  sourceEditor?: StudentLearningGuideSourceEditor;
  achievementEditor?: AchievementSourceEditor;
  onChange: (guides: StudentLearningGuides) => void;
}) {
  const t = useTranslations("curriculum");
  const tc = useTranslations("common");
  const fieldId = useId();
  const current = guides ?? EMPTY_STUDENT_LEARNING_GUIDES;
  const achievementGuides = current.achievements ?? [];
  const coreIdea = current.coreIdea ?? { explanation: "", lifeConnection: "", keywords: [] };
  const formattedKeywords = formatInquiryKeywordLines(coreIdea.keywords);
  const [keywordDraft, setKeywordDraft] = useState(formattedKeywords);
  useEffect(() => setKeywordDraft(formattedKeywords), [formattedKeywords]);
  const hasAchievementSection = achievements.length > 0 || Boolean(achievementEditor);
  const coreSentenceNumber = hasAchievementSection ? 3 : 2;
  const essentialQuestionNumber = hasAchievementSection ? 4 : 3;

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
        {sourceEditor ? (
          <div
            data-student-guide-source="core-idea"
            className="mt-3 rounded-lg border border-amber-200/70 bg-background/85 px-3 py-3 dark:border-amber-800/50"
          >
            <Label className="sr-only" htmlFor={`${fieldId}-core-idea-source`}>
              {t("coreIdeaSourceLabel")}
            </Label>
            <textarea
              id={`${fieldId}-core-idea-source`}
              rows={3}
              value={coreIdeaSource}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium leading-6 text-foreground"
              onChange={(event) => sourceEditor.onCoreIdeaChange(event.target.value)}
            />
          </div>
        ) : coreIdeaSource.trim() && (
          <p
            data-student-guide-source="core-idea"
            className="mt-3 rounded-lg border border-amber-200/70 bg-background/85 px-3 py-3 text-sm font-medium leading-6 text-foreground dark:border-amber-800/50"
          >
            {coreIdeaSource}
          </p>
        )}
        {showEditors ? (
        <div data-student-understanding-editor className="mt-4 grid gap-3 border-t border-amber-200/70 pt-4 dark:border-amber-800/50 lg:grid-cols-2">
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

      {hasAchievementSection && (
        <section
          data-student-guide-section="achievement"
          className="rounded-xl border border-teal-200/80 bg-teal-50/70 p-3.5 dark:border-teal-800/60 dark:bg-teal-950/20 sm:p-4"
          aria-labelledby={`${fieldId}-achievement-title`}
        >
          <div className="flex items-start gap-3">
            <span data-student-guide-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800 dark:bg-teal-900/60 dark:text-teal-200" aria-hidden="true">2</span>
            <div className="min-w-0">
              <h3 id={`${fieldId}-achievement-title`} className="flex items-center gap-1.5 text-sm font-semibold text-teal-950 dark:text-teal-100">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                {t("studentGuideAchievementSectionTitle")}
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-teal-800/80 dark:text-teal-200/75">
                {t("studentGuideAchievementSectionDesc")}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {achievements.map((achievement, index) => {
              const guide = achievementGuides.find((item) => item.index === index)
                ?? { index, explanation: "" };
              return (
                <article
                  key={`${achievement.code}-${index}`}
                  data-student-guide-source="achievement"
                  className="rounded-lg border border-teal-200/70 bg-background/85 px-3 py-3 dark:border-teal-800/50"
                >
                  {achievementEditor ? (
                    <div className="grid gap-2 sm:grid-cols-[minmax(9rem,0.35fr)_minmax(0,1fr)_auto]">
                      <div className="space-y-1">
                        <Label className="sr-only" htmlFor={`${fieldId}-achievement-code-${index}`}>
                          {t("achievementCodeLabel", { n: index + 1 })}
                        </Label>
                        <input
                          id={`${fieldId}-achievement-code-${index}`}
                          value={achievement.code}
                          placeholder={t("achievementCodePlaceholder")}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-semibold text-foreground"
                          onChange={(event) => achievementEditor.onChange(index, {
                            ...achievement,
                            code: event.target.value,
                          })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="sr-only" htmlFor={`${fieldId}-achievement-content-${index}`}>
                          {t("achievementContentLabel", { n: index + 1 })}
                        </Label>
                        <textarea
                          id={`${fieldId}-achievement-content-${index}`}
                          rows={2}
                          value={achievement.content}
                          placeholder={t("achievementContentPlaceholder")}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground"
                          onChange={(event) => achievementEditor.onChange(index, {
                            ...achievement,
                            content: event.target.value,
                          })}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive"
                        onClick={() => achievementEditor.onRemove(index)}
                        aria-label={tc("delete")}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
                      <span className="shrink-0 text-sm font-semibold text-teal-800 dark:text-teal-200">
                        {achievement.code}
                      </span>
                      <p className="text-sm leading-6 text-foreground">{achievement.content}</p>
                    </div>
                  )}
                  {showEditors ? (
                    <div data-student-understanding-editor className="mt-3 border-t border-teal-200/70 pt-3 dark:border-teal-800/50">
                      <Label htmlFor={`${fieldId}-achievement-explanation-${index}`}>
                        {t("studentGuideAchievementEasyLabel", { n: index + 1 })}
                      </Label>
                      <textarea
                        id={`${fieldId}-achievement-explanation-${index}`}
                        rows={2}
                        value={guide.explanation}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground"
                        onChange={(event) => onChange({
                          ...current,
                          achievements: replaceIndexed(achievementGuides, index, {
                            index,
                            explanation: event.target.value,
                          }),
                        })}
                      />
                    </div>
                  ) : guide.explanation ? (
                    <div data-student-understanding-guide="achievement" className="mt-3 border-t border-teal-200/70 pt-3 text-xs dark:border-teal-800/50">
                      <p className="font-semibold">{t("studentGuideAchievementEasyTitle")}</p>
                      <p className="mt-0.5 leading-relaxed text-muted-foreground">{guide.explanation}</p>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {achievementEditor && (
              <Button type="button" variant="outline" size="sm" onClick={achievementEditor.onAdd}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("addAchievement")}
              </Button>
            )}
          </div>
        </section>
      )}

      {(coreSentences.length > 0 || sourceEditor) && (
        <section
          data-student-guide-section="core-sentence"
          className="rounded-xl border border-sky-200/80 bg-sky-50/70 p-3.5 dark:border-sky-800/60 dark:bg-sky-950/20 sm:p-4"
          aria-labelledby={`${fieldId}-core-sentence-title`}
        >
          <div className="flex items-start gap-3">
            <span data-student-guide-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800 dark:bg-sky-900/60 dark:text-sky-200" aria-hidden="true">{coreSentenceNumber}</span>
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
                  {sourceEditor ? (
                    <div data-student-guide-source="core-sentence" className="flex items-start gap-2">
                      <Label className="sr-only" htmlFor={`${fieldId}-sentence-source-${index}`}>
                        {t("coreSentenceSourceLabel", { n: index + 1 })}
                      </Label>
                      <textarea
                        id={`${fieldId}-sentence-source-${index}`}
                        rows={2}
                        value={sentence}
                        className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium leading-6 text-foreground"
                        onChange={(event) => sourceEditor.onCoreSentenceChange(index, event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive"
                        onClick={() => sourceEditor.onCoreSentenceRemove(index)}
                        aria-label={tc("delete")}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <p data-student-guide-source="core-sentence" className="text-sm font-medium leading-6 text-foreground">
                      {sentence}
                    </p>
                  )}
                  {showEditors ? (
                  <div data-student-understanding-editor className="mt-3 space-y-1 border-t border-sky-200/70 pt-3 dark:border-sky-800/50">
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
            {sourceEditor && (
              <Button type="button" variant="outline" size="sm" onClick={sourceEditor.onCoreSentenceAdd}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("addItem")}
              </Button>
            )}
          </div>
        </section>
      )}

      {(essentialQuestions.length > 0 || sourceEditor) && (
        <section
          data-student-guide-section="essential-question"
          className="rounded-xl border border-violet-200/80 bg-violet-50/70 p-3.5 dark:border-violet-800/60 dark:bg-violet-950/20 sm:p-4"
          aria-labelledby={`${fieldId}-essential-question-title`}
        >
          <div className="flex items-start gap-3">
            <span data-student-guide-number className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-800 dark:bg-violet-900/60 dark:text-violet-200" aria-hidden="true">{essentialQuestionNumber}</span>
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
                  {sourceEditor ? (
                    <div data-student-guide-source="essential-question" className="flex items-start gap-2">
                      <Label className="sr-only" htmlFor={`${fieldId}-question-source-${index}`}>
                        {t("essentialQuestionSourceLabel", { n: index + 1 })}
                      </Label>
                      <textarea
                        id={`${fieldId}-question-source-${index}`}
                        rows={2}
                        value={question}
                        className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium leading-6 text-foreground"
                        onChange={(event) => sourceEditor.onEssentialQuestionChange(index, event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive"
                        onClick={() => sourceEditor.onEssentialQuestionRemove(index)}
                        aria-label={tc("delete")}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <p data-student-guide-source="essential-question" className="text-sm font-medium leading-6 text-foreground">
                      {question}
                    </p>
                  )}
                  {showEditors ? (
                  <div data-student-understanding-editor className="mt-3 grid gap-3 border-t border-violet-200/70 pt-3 dark:border-violet-800/50 lg:grid-cols-2">
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
            {sourceEditor && (
              <Button type="button" variant="outline" size="sm" onClick={sourceEditor.onEssentialQuestionAdd}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("addItem")}
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
