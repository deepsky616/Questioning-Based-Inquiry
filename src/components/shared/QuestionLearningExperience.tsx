"use client";

import Link from "next/link";
import { AiEthicsLearning } from "@/components/shared/AiEthicsLearning";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { QuestionDetectiveSlides } from "@/components/shared/QuestionDetectiveSlides";
import { TeacherQuestionLearningGuide } from "@/components/teacher/TeacherQuestionLearningGuide";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TeachingExamplesData } from "@/lib/question-teaching-examples-types";

export type QuestionLearningAudience = "student" | "teacher";
type LearningView = "learning" | "ethics" | "teaching";
type PendingFocus = "teachingTitle" | "teachingGuideTrigger" | null;

export function QuestionLearningExperience({ audience, teachingExamples }: { audience: QuestionLearningAudience; teachingExamples?: TeachingExamplesData }) {
  const t = useTranslations("questionLearning");
  const [activeView, setActiveView] = useState<LearningView>("learning");
  const id = useId();
  const views: LearningView[] = audience === "teacher" ? ["learning", "ethics", "teaching"] : ["learning", "ethics"];
  const ethicsTabRef = useRef<HTMLButtonElement>(null);
  const learningTabRef = useRef<HTMLButtonElement>(null);
  const teachingTabRef = useRef<HTMLButtonElement>(null);
  const teachingTitleRef = useRef<HTMLHeadingElement>(null);
  const teachingGuideTriggerRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<PendingFocus>(null);

  useEffect(() => {
    const syncHash = () => setActiveView(window.location.hash === "#ai-ethics" ? "ethics" : "learning");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    const focusTarget = pendingFocus.current;
    const targetIsVisible =
      (activeView === "teaching" && focusTarget === "teachingTitle") ||
      (activeView === "learning" && focusTarget === "teachingGuideTrigger");
    if (!targetIsVisible) return;

    requestAnimationFrame(() => {
      if (pendingFocus.current !== focusTarget) return;
      (focusTarget === "teachingTitle" ? teachingTitleRef : teachingGuideTriggerRef).current?.focus();
      pendingFocus.current = null;
    });
  }, [activeView]);

  const showTeaching = () => {
    pendingFocus.current = "teachingTitle";
    setActiveView("teaching");
  };

  const returnToLearning = () => {
    pendingFocus.current = "teachingGuideTrigger";
    setActiveView("learning");
  };

  const selectView = (next: LearningView) => {
    pendingFocus.current = null;
    setActiveView(next);
    const url = new URL(window.location.href);
    if (next === "ethics") url.hash = "ai-ethics";
    else if (url.hash === "#ai-ethics") url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  };

  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, current: LearningView) => {
    const currentIndex = views.indexOf(current);
    const next = event.key === "Home" ? views[0]
      : event.key === "End" ? views[views.length - 1]
      : event.key === "ArrowRight" ? views[(currentIndex + 1) % views.length]
      : event.key === "ArrowLeft" ? views[(currentIndex - 1 + views.length) % views.length]
      : null;

    if (!next) return;

    event.preventDefault();
    selectView(next);
    requestAnimationFrame(() => {
      (next === "learning" ? learningTabRef : next === "ethics" ? ethicsTabRef : teachingTabRef).current?.focus();
    });
  };

  const completionActions =
    audience === "student" ? (
      <Button asChild>
        <Link href="/student-practice">{t("startPractice")}</Link>
      </Button>
    ) : (
      <>
        <Button asChild>
          <Link href="/teacher-practice">{t("tryPractice")}</Link>
        </Button>
        <Button ref={teachingGuideTriggerRef} variant="outline" onClick={showTeaching}>
          {t("viewTeachingGuide")}
        </Button>
      </>
    );

  return (
    <div className="space-y-6">
      <PageHeader iconHref={`/${audience}-question-learning`} title={t("title")} description={t("subtitle")} />
      <div
        role="tablist"
        aria-label={t("learningViewsLabel")}
        className="flex min-h-11 gap-1 border-b"
      >
        {views.map((view) => (
          <button
            key={view}
            ref={view === "learning" ? learningTabRef : view === "ethics" ? ethicsTabRef : teachingTabRef}
            id={`${id}-view-${view}`}
            type="button"
            role="tab"
            aria-selected={activeView === view}
            aria-controls={`${id}-panel-${view}`}
            tabIndex={activeView === view ? 0 : -1}
            onClick={() => selectView(view)}
            onKeyDown={(event) => moveTab(event, view)}
            className={cn(
              "min-h-11 border-b-2 px-3 text-sm font-bold sm:px-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              activeView === view
                ? "border-sky-600 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(view === "ethics" ? "ethicsTab" : view === "teaching" ? "teachingView" : audience === "student" ? "studentLearningView" : "learningView")}
          </button>
        ))}
      </div>
      <section
        id={`${id}-panel-learning`}
        role="tabpanel"
        aria-labelledby={`${id}-view-learning`}
        hidden={activeView !== "learning"}
      >
        <QuestionDetectiveSlides allowPresentation={audience === "teacher"} completionActions={completionActions} />
      </section>
      <section id={`${id}-panel-ethics`} role="tabpanel" aria-labelledby={`${id}-view-ethics`} hidden={activeView !== "ethics"}>
        <AiEthicsLearning audience={audience} />
      </section>
      {audience === "teacher" && <section
        id={`${id}-panel-teaching`}
        role="tabpanel"
        aria-labelledby={`${id}-view-teaching`}
        hidden={activeView !== "teaching"}
      >
        <TeacherQuestionLearningGuide titleRef={teachingTitleRef} onBack={returnToLearning} examplesData={teachingExamples} />
      </section>}
    </div>
  );
}
