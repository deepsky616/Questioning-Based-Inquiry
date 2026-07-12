"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuestionLearningSlideContent } from "@/components/shared/QuestionLearningSlideContent";
import { cn } from "@/lib/utils";
import { QUESTION_LEARNING_CHECKS } from "@/lib/question-detective-content";
import type { Cognitive } from "@/lib/question-practice-data";

export const QUESTION_LEARNING_SLIDES = [
  "cover",
  "whyQuestions",
  "twoAxes",
  "openClosed",
  "inquiryDepth",
  "factualDefinition",
  "factualFormulas",
  "conceptualDefinition",
  "conceptualFormulas",
  "controversialDefinition",
  "controversialFormulas",
  "comparison",
  "check",
  "synthesis",
] as const;

export type QuestionLearningSlide = (typeof QUESTION_LEARNING_SLIDES)[number];

export function QuestionDetectiveSlides() {
  const t = useTranslations("questionLearning");
  const tClassification = useTranslations("classification");
  const [index, setIndex] = useState(0);
  const [checkIndex, setCheckIndex] = useState(0);
  const [selectedType, setSelectedType] = useState<Cognitive | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingTabFocus = useRef<number | null>(null);
  const slide = QUESTION_LEARNING_SLIDES[index];
  const total = QUESTION_LEARNING_SLIDES.length;
  const panelId = "question-learning-panel";
  const activeTabId = `question-learning-tab-${index}`;
  const progress = t("slideProgress", { current: index + 1, total });

  useEffect(() => {
    if (pendingTabFocus.current !== index) return;

    tabRefs.current[index]?.focus();
    pendingTabFocus.current = null;
  }, [index]);

  const typeLabel = (type: Cognitive) => tClassification(`${type}.label`);

  const goTo = (nextIndex: number) => {
    setIndex(Math.min(total - 1, Math.max(0, nextIndex)));
  };

  const moveCheck = () => {
    setCheckIndex((current) => (current + 1) % QUESTION_LEARNING_CHECKS.length);
    setSelectedType(null);
  };

  const handleStageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;

    let nextIndex: number | null = null;

    if (event.key === "ArrowLeft") nextIndex = index - 1;
    if (event.key === "ArrowRight") nextIndex = index + 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = total - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      goTo(nextIndex);
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowLeft") nextIndex = tabIndex - 1;
    if (event.key === "ArrowRight") nextIndex = tabIndex + 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = total - 1;

    if (nextIndex === null) return;

    event.preventDefault();
    event.stopPropagation();
    const boundedIndex = Math.min(total - 1, Math.max(0, nextIndex));

    if (boundedIndex === index) {
      event.currentTarget.focus();
      return;
    }

    pendingTabFocus.current = boundedIndex;
    goTo(boundedIndex);
  };

  return (
    <div
      data-testid="question-learning-stage"
      tabIndex={0}
      onKeyDown={handleStageKeyDown}
      className="mt-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
    >
      <div className="w-full overflow-hidden rounded-lg border bg-background shadow-sm lg:aspect-video">
        <div
          key={slide}
          id={panelId}
          role="tabpanel"
          aria-labelledby={activeTabId}
          className="min-h-[34rem] w-full transition-opacity duration-200 motion-reduce:transition-none lg:h-full lg:min-h-0"
        >
          <QuestionLearningSlideContent
            slide={slide}
            typeLabel={typeLabel}
            checkNext={t("checkNext")}
            checkRestart={t("checkRestart")}
            checkIndex={checkIndex}
            selectedType={selectedType}
            onSelectType={setSelectedType}
            onMoveCheck={moveCheck}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4">
        <Button
          variant="outline"
          aria-label={t("previous")}
          className="h-11 min-w-11 gap-1 px-3"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t("previous")}</span>
        </Button>

        <div className="min-w-0">
          <p className="text-center text-sm font-bold text-foreground" aria-live="polite" aria-atomic="true">
            {progress}
          </p>
          <div
            className="mt-1 flex min-h-11 items-center justify-center overflow-hidden"
            role="tablist"
            aria-label={t("slideNavigation")}
          >
            {QUESTION_LEARNING_SLIDES.map((slideKey, tabIndex) => {
              const distance = Math.abs(tabIndex - index);
              const showOnCompactScreen =
                distance <= 2 ||
                (index < 2 && tabIndex < 5) ||
                (index > total - 3 && tabIndex >= total - 5);

              return (
                <button
                  key={slideKey}
                  id={`question-learning-tab-${tabIndex}`}
                  type="button"
                  role="tab"
                  aria-selected={tabIndex === index}
                  aria-controls={panelId}
                  aria-label={t("slideProgress", { current: tabIndex + 1, total })}
                  tabIndex={tabIndex === index ? 0 : -1}
                  ref={(element) => {
                    tabRefs.current[tabIndex] = element;
                  }}
                  onClick={() => goTo(tabIndex)}
                  onKeyDown={(event) => handleTabKeyDown(event, tabIndex)}
                  className={cn(
                    "h-11 w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none xl:flex",
                    showOnCompactScreen ? "flex" : "hidden",
                  )}
                >
                  <span
                    className={cn(
                      "block h-2.5 w-2.5 rounded-full transition-colors motion-reduce:transition-none",
                      tabIndex === index
                        ? "bg-sky-600 ring-4 ring-sky-100 dark:bg-sky-300 dark:ring-sky-950"
                        : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
                    )}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>

        <Button
          variant="outline"
          aria-label={t("next")}
          className="h-11 min-w-11 gap-1 px-3"
          onClick={() => goTo(index + 1)}
          disabled={index === total - 1}
        >
          <span className="hidden sm:inline">{t("next")}</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
