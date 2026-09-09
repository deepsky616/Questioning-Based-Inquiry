"use client";

import { useId, useState, type RefObject } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, BarChart3, MessageCircleQuestion, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { questionTeachingGuideForLocale } from "@/lib/question-teaching-guide-data";
import { practiceSelectionSearch } from "@/lib/practice-selection";
import type { TeachingExamplesData } from "@/lib/question-teaching-examples-types";
import { TeacherQuestionExamples } from "./TeacherQuestionExamples";

interface TeacherQuestionLearningGuideProps {
  titleRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  examplesData?: TeachingExamplesData;
}

export function TeacherQuestionLearningGuide({
  titleRef,
  onBack,
  examplesData,
}: TeacherQuestionLearningGuideProps) {
  const t = useTranslations("questionLearning");
  const locale = useLocale();
  const teachingGuide = questionTeachingGuideForLocale(locale);
  const gradeId = useId();
  const subjectId = useId();
  const [requestedGrade, setRequestedGrade] = useState("");
  const [subjectSelection, setSubjectSelection] = useState({ grade: "", subject: "all" });
  const grades = examplesData?.grades ?? [];
  const grade = grades.includes(requestedGrade) ? requestedGrade : grades[0] ?? "";
  const topics = examplesData?.topics.filter(topic => topic.grade === grade) ?? [];
  const subject = subjectSelection.grade === grade ? subjectSelection.subject : "all";
  const visibleTopics = subject === "all" ? topics : topics.filter(topic => topic.subject.ko === subject);
  const english = locale.toLowerCase().startsWith("en");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            ref={titleRef}
            tabIndex={-1}
            className="text-xl font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
          >
            {t("teachingView")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("teachingGuideDescription")}</p>
        </div>
        <Button variant="outline" className="min-h-11 gap-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("backToLearning")}
        </Button>
      </div>

      {examplesData?.status === "ready" && <section className="rounded-xl border bg-muted/30 p-4" aria-label={t("gradeExamplesTitle")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-lg font-bold">{t("examplesForGrade", { grade })}</h4>
          {grades.length > 1 && <div className="flex items-center gap-2"><label htmlFor={gradeId} className="text-sm font-medium">{t("exampleGrade")}</label><select id={gradeId} value={grade} onChange={event => setRequestedGrade(event.target.value)} className="min-h-11 rounded-md border bg-background px-3 text-base text-foreground">{grades.map(value => <option key={value} value={value}>{t("exampleGradeOption", { grade: value })}</option>)}</select></div>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor={subjectId} className="text-sm font-medium">{t("exampleSubject")}</label>
          <select id={subjectId} value={subject} onChange={event => setSubjectSelection({ grade, subject: event.target.value })} className="min-h-11 max-w-full rounded-md border bg-background px-3 text-base text-foreground">
            <option value="all">{t("exampleAllSubjects")}</option>
            {topics.map(topic => <option key={topic.id} value={topic.subject.ko}>{english ? topic.subject.en : topic.subject.ko}</option>)}
          </select>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("exampleBandHint", { band: Number(grade) <= 2 ? "1–2" : Number(grade) <= 4 ? "3–4" : "5–6" })}</p>
      </section>}
      {examplesData?.status === "unassigned" && <p className="rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed">{t("examplesUnassigned")} <Link href="/teacher-settings" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">{t("examplesSettings")}</Link></p>}
      {examplesData?.status === "unavailable" && <div role="alert" className="rounded-xl border p-4 text-sm"><p>{t("examplesUnavailable")}</p><Button variant="outline" className="mt-2" onClick={() => window.location.reload()}>{t("examplesRetry")}</Button></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {teachingGuide.map((item, index) => {
          const diagnosticFocuses = item.id === "openClosed" ? ["closed", "open"] as const : item.focus ? [item.focus] : [];

          return (
            <article key={item.id} className="rounded-lg border bg-background p-5">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sm font-black text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h4 className="pt-1 text-lg font-bold text-foreground">{item.title}</h4>
              </div>

              <dl className="mt-5 space-y-4">
                <div>
                  <dt className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Target className="h-4 w-4 text-sky-700 dark:text-sky-300" aria-hidden="true" />
                    {t("objective")}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.objective}</dd>
                </div>
                <div>
                  <dt className="text-sm font-bold text-foreground">{t("misconception")}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.misconception}</dd>
                </div>
                <div className="border-l-4 border-emerald-400 pl-3">
                  <dt className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <MessageCircleQuestion
                      className="h-4 w-4 text-emerald-700 dark:text-emerald-300"
                      aria-hidden="true"
                    />
                    {t("prompt")}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.prompt}</dd>
                </div>
                <div className="border-l-4 border-rose-400 pl-3">
                  <dt className="text-sm font-bold text-foreground">{t("followUp")}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.followUp}</dd>
                </div>
              </dl>
              <TeacherQuestionExamples guideId={item.id} topics={visibleTopics} />
              {diagnosticFocuses.length > 0 && <div className="mt-5 flex flex-wrap gap-2">
                {diagnosticFocuses.map(focus => <Button key={focus} asChild variant="outline" size="sm" className="h-auto min-h-11 max-w-full gap-2 whitespace-normal py-2 text-left">
                  <Link href={`/teacher-practice?view=stats&${practiceSelectionSearch({ tab: "quiz", quizMode: focus === "closed" || focus === "open" ? "closure" : "cognitive", focus })}`}>
                    <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t(item.id === "openClosed" ? focus === "closed" ? "viewClosedDiagnostic" : "viewOpenDiagnostic" : "viewClassDiagnostic")}
                  </Link>
                </Button>)}
              </div>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
