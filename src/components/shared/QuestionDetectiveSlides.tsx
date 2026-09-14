"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QuestionLearningSlideContent } from "@/components/shared/QuestionLearningSlideContent";
import { cn } from "@/lib/utils";
import { getQuestionDetectiveContent } from "@/lib/question-detective-content";
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

export function QuestionDetectiveSlides({ completionActions, allowPresentation = false }: { completionActions?: ReactNode; allowPresentation?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("questionLearning");
  const tClassification = useTranslations("classification");
  const content = getQuestionDetectiveContent(locale);
  const [index, setIndex] = useState(0);
  const [checkIndex, setCheckIndex] = useState(0);
  const [selectedType, setSelectedType] = useState<Cognitive | null>(null);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const leavingForCompletion = useRef(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingTabFocus = useRef<number | null>(null);
  const checkPromptRef = useRef<HTMLParagraphElement>(null);
  const pendingCheckPromptFocus = useRef(false);
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

  useEffect(() => {
    if (!pendingCheckPromptFocus.current) return;

    checkPromptRef.current?.focus();
    pendingCheckPromptFocus.current = false;
  }, [checkIndex]);

  useEffect(() => {
    if (presentationOpen && frameRef.current) frameRef.current.scrollTop = 0;
  }, [index, presentationOpen]);

  const typeLabel = (type: Cognitive) => tClassification(`${type}.label`);

  const goTo = (nextIndex: number) => {
    setIndex(Math.min(total - 1, Math.max(0, nextIndex)));
  };

  const moveCheck = () => {
    pendingCheckPromptFocus.current = true;
    setCheckIndex((current) => (current + 1) % content.checks.length);
    setSelectedType(null);
  };

  const handleStageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (presentationOpen) {
      const target = event.target as HTMLElement;
      if (target.closest("button,input,select,textarea,a,[role='tab']") && !target.closest("[data-slide-control]")) return;
    } else if (event.target !== event.currentTarget) return;

    let nextIndex: number | null = null;

    if (event.key === "ArrowLeft") nextIndex = index - 1;
    if (event.key === "ArrowRight") nextIndex = index + 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = total - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      event.stopPropagation();
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

  // 한 장의 DOM만 옮겨 렌더링하여 패널 ID와 확인 문제의 초점이 중복되지 않게 한다.
  const stage = (
    <div
      ref={stageRef}
      data-testid="question-learning-stage"
      tabIndex={0}
      onKeyDown={handleStageKeyDown}
      className={cn("rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4", presentationOpen ? "learning-content flex min-h-0 flex-1 flex-col" : "mt-4")}
    >
      <div ref={frameRef} className={cn("w-full rounded-lg border bg-card text-card-foreground shadow-sm", presentationOpen ? "min-h-0 flex-1 overflow-auto overscroll-contain" : "overflow-hidden lg:aspect-video")}>
        <div
          key={slide}
          id={panelId}
          role="tabpanel"
          aria-labelledby={activeTabId}
          className={cn("w-full transition-opacity duration-200 motion-reduce:transition-none motion-reduce:duration-0", presentationOpen ? "question-learning-presentation-panel grid min-h-full [&>div]:h-auto [&>div]:min-h-full [&>div]:min-w-0" : "min-h-[34rem] lg:h-full lg:min-h-0")}
        >
          <QuestionLearningSlideContent
            completionActions={presentationOpen && completionActions ? <div className="contents" onClick={(event) => {
              if (!(event.target as HTMLElement).closest("button,a")) return;
              // 대상 버튼의 이동 동작이 먼저 실행된 뒤 수업 화면을 닫는다.
              leavingForCompletion.current = true;
              setPresentationOpen(false);
            }}>{completionActions}</div> : completionActions}
            content={content}
            slide={slide}
            typeLabel={typeLabel}
            checkNext={t("checkNext")}
            checkRestart={t("checkRestart")}
            checkIndex={checkIndex}
            checkPromptRef={checkPromptRef}
            selectedType={selectedType}
            onSelectType={setSelectedType}
            onMoveCheck={moveCheck}
          />
        </div>
      </div>

      <div className="mt-4 grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4">
        <Button
          data-slide-control
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
              const showOnNarrowScreen =
                distance <= 1 ||
                (index === 0 && tabIndex < 3) ||
                (index === total - 1 && tabIndex >= total - 3);
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
                    showOnNarrowScreen
                      ? "flex"
                      : showOnCompactScreen
                        ? "hidden min-[360px]:flex"
                        : "hidden",
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
          data-slide-control
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

  if (!allowPresentation) return stage;

  return (
    <Dialog open={presentationOpen} onOpenChange={setPresentationOpen}>
      <div className="mt-4 flex justify-end">
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="min-h-11 gap-2">
            <Monitor className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t("presentationOpen")}
          </Button>
        </DialogTrigger>
      </div>
      {!presentationOpen && stage}
      {presentationOpen && (
        <DialogContent
          className="learning-shell inset-0 left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-3 overflow-hidden rounded-none p-3 sm:rounded-none sm:p-5"
          onOpenAutoFocus={(event) => { event.preventDefault(); stageRef.current?.focus(); }}
          onCloseAutoFocus={(event) => {
            if (leavingForCompletion.current) event.preventDefault();
            leavingForCompletion.current = false;
          }}
        >
          <DialogHeader className="shrink-0 pr-8 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DialogTitle className="text-lg sm:text-xl">{t("presentationTitle")}</DialogTitle>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="min-h-11">{t("presentationClose")}</Button>
              </DialogClose>
            </div>
            <DialogDescription>{t("presentationDescription")}</DialogDescription>
          </DialogHeader>
          {stage}
        </DialogContent>
      )}
    </Dialog>
  );
}
