"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { QuestionDetectiveSlides } from "@/components/shared/QuestionDetectiveSlides";
import { TeacherQuestionLearningGuide } from "@/components/teacher/TeacherQuestionLearningGuide";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type QuestionLearningAudience = "student" | "teacher";
type TeacherView = "learning" | "teaching";

export function QuestionLearningExperience({ audience }: { audience: QuestionLearningAudience }) {
  const t = useTranslations("questionLearning");
  const [teacherView, setTeacherView] = useState<TeacherView>("learning");
  const learningTabRef = useRef<HTMLButtonElement>(null);
  const teachingTabRef = useRef<HTMLButtonElement>(null);
  const teachingTitleRef = useRef<HTMLHeadingElement>(null);
  const pendingTeachingTitleFocus = useRef(false);

  useEffect(() => {
    if (teacherView !== "teaching" || !pendingTeachingTitleFocus.current) return;

    requestAnimationFrame(() => {
      if (!pendingTeachingTitleFocus.current) return;
      teachingTitleRef.current?.focus();
      pendingTeachingTitleFocus.current = false;
    });
  }, [teacherView]);

  const showTeaching = () => {
    pendingTeachingTitleFocus.current = true;
    setTeacherView("teaching");
  };

  const selectTeacherView = (next: TeacherView) => {
    pendingTeachingTitleFocus.current = false;
    setTeacherView(next);
  };

  const moveTeacherTab = (event: KeyboardEvent<HTMLButtonElement>, current: TeacherView) => {
    const next =
      event.key === "Home"
        ? "learning"
        : event.key === "End"
          ? "teaching"
          : event.key === "ArrowLeft" || event.key === "ArrowRight"
            ? current === "learning"
              ? "teaching"
              : "learning"
            : null;

    if (!next) return;

    event.preventDefault();
    selectTeacherView(next);
    requestAnimationFrame(() => {
      (next === "learning" ? learningTabRef : teachingTabRef).current?.focus();
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
        <Button variant="outline" onClick={showTeaching}>
          {t("viewTeachingGuide")}
        </Button>
      </>
    );

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {audience === "student" ? (
        <QuestionDetectiveSlides completionActions={completionActions} />
      ) : (
        <>
          <div
            role="tablist"
            aria-label={t("teacherViewsLabel")}
            className="flex min-h-11 gap-1 border-b"
          >
            {(["learning", "teaching"] as const).map((view) => (
              <button
                key={view}
                ref={view === "learning" ? learningTabRef : teachingTabRef}
                id={`question-learning-view-${view}`}
                type="button"
                role="tab"
                aria-selected={teacherView === view}
                aria-controls={`question-learning-panel-${view}`}
                tabIndex={teacherView === view ? 0 : -1}
                onClick={() => selectTeacherView(view)}
                onKeyDown={(event) => moveTeacherTab(event, view)}
                className={cn(
                  "min-h-11 border-b-2 px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  teacherView === view
                    ? "border-sky-600 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(view === "learning" ? "learningView" : "teachingView")}
              </button>
            ))}
          </div>
          <section
            id={`question-learning-panel-${teacherView}`}
            role="tabpanel"
            aria-labelledby={`question-learning-view-${teacherView}`}
          >
            {teacherView === "learning" ? (
              <QuestionDetectiveSlides completionActions={completionActions} />
            ) : (
              <TeacherQuestionLearningGuide
                titleRef={teachingTitleRef}
                onBack={() => selectTeacherView("learning")}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
