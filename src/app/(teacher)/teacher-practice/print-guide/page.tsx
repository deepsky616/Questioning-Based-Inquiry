"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getQuestionPracticePrintGuide } from "@/lib/question-practice-print-guide";

export default function TeacherPracticePrintGuidePage() {
  const locale = useLocale();
  const guide = getQuestionPracticePrintGuide(locale);
  const isKo = locale === "ko";

  useEffect(() => {
    document.documentElement.classList.add("question-practice-print-light");
    document.body.classList.add("question-practice-print-light");
    return () => {
      document.documentElement.classList.remove("question-practice-print-light");
      document.body.classList.remove("question-practice-print-light");
    };
  }, []);

  const printWorksheet = () => {
    const root = document.documentElement;
    const body = document.body;
    const rootWasDark = root.classList.contains("dark");
    const bodyWasDark = body.classList.contains("dark");

    root.classList.remove("dark");
    body.classList.remove("dark");
    root.classList.add("question-practice-print-light");
    body.classList.add("question-practice-print-light", "question-practice-print-mode");

    const cleanup = () => {
      body.classList.remove("question-practice-print-mode");
      if (rootWasDark) root.classList.add("dark");
      if (bodyWasDark) body.classList.add("dark");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup, { once: true });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  return (
    <div className="question-practice-print-page mx-auto max-w-5xl space-y-5 bg-white text-slate-950 [color-scheme:light]">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-sm">
        <Button asChild variant="outline" className="gap-2">
          <Link href="/teacher-practice">
            <ArrowLeft className="h-4 w-4" />
            {guide.backButton}
          </Link>
        </Button>
        <Button onClick={printWorksheet} className="gap-2 font-semibold">
          <Printer className="h-4 w-4" />
          {guide.printButton}
        </Button>
      </div>

      <article className="question-practice-print qp-paper rounded-xl border bg-white p-6 text-slate-950 shadow-sm [color-scheme:light] dark:bg-white dark:text-slate-950 print:border-0 print:p-0 print:shadow-none" style={{ colorScheme: "light" }}>
        <div className="qp-header border-b border-slate-300 pb-5">
          <p className="qp-eyebrow text-xs font-bold uppercase tracking-[0.12em] text-indigo-700">{guide.eyebrow}</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="qp-title text-3xl font-extrabold leading-tight text-slate-950">{guide.title}</h1>
              <p className="qp-subtitle mt-2 text-sm leading-6 text-slate-700">{guide.subtitle}</p>
            </div>
            <div className="qp-student-fields ml-auto grid w-full max-w-md grid-cols-2 gap-x-4 gap-y-2 text-right text-sm text-slate-700 print:max-w-sm">
              {[
                guide.gradeLabel,
                guide.classNameLabel,
                guide.numberLabel,
                guide.nameLabel,
              ].map((label) => (
                <div key={label} className="qp-field flex items-center justify-end gap-2">
                  <span className="w-12 shrink-0 font-semibold">{label}</span>
                  <span className="qp-write-line h-7 min-w-16 flex-1 border-b border-slate-500" />
                </div>
              ))}
            </div>
          </div>
          <p className="no-print mt-4 rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 print:bg-indigo-50">
            {guide.teacherNote}
          </p>
        </div>

        <section className="mt-6 space-y-4">
          <h2 className="qp-section-heading text-xl font-extrabold text-slate-950">{guide.guideTitle}</h2>
          <div className="grid gap-4 print:gap-3">
            {guide.sections.map((section) => (
              <section
                key={section.title}
                className="qp-card break-inside-avoid rounded-lg border border-slate-300 p-4 print:rounded-none"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-3xl">
                    <h3 className="qp-card-title text-lg font-extrabold text-slate-950">{section.title}</h3>
                    <p className="qp-muted mt-1 text-sm leading-6 text-slate-700">{section.summary}</p>
                  </div>
                  <span className="qp-pill rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {section.note}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3 print:grid-cols-3">
                  {section.patterns.map((pattern) => (
                    <div key={pattern.title} className="qp-pattern rounded-md border border-slate-200 p-3">
                      <h4 className="qp-pattern-title text-sm font-extrabold text-slate-950">{pattern.title}</h4>
                      <div className="qp-muted mt-2 space-y-2 text-xs leading-5 text-slate-700">
                        <p>
                          <strong className="text-slate-950">{guide.termsLabel}: </strong>
                          {pattern.terms.join(", ")}
                        </p>
                        <p>
                          <strong className="text-slate-950">{guide.formulasLabel}: </strong>
                          {pattern.formulas.join(" / ")}
                        </p>
                        <ul className="list-disc space-y-1 pl-4">
                          {pattern.examples.map((example) => (
                            <li key={example}>{example}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

        <section className="qp-activity mt-7 space-y-4">
          <h2 className="qp-section-heading text-xl font-extrabold text-slate-950">{guide.worksheetTitle}</h2>
          <div className="grid gap-4 print:gap-3">
            {guide.worksheets.map((worksheet, worksheetIndex) => (
              <section
                key={worksheet.title}
                className="qp-card break-inside-avoid rounded-lg border border-slate-300 p-4 print:rounded-none"
              >
                <h3 className="qp-card-title text-base font-extrabold text-slate-950">{worksheet.title}</h3>
                <p className="qp-muted mt-1 text-sm text-slate-700">{worksheet.directions}</p>
                <div className="mt-4 space-y-4">
                  {worksheet.prompts.map((prompt, index) => (
                    <div key={prompt} className="qp-question-block grid gap-2">
                      <p className="qp-prompt text-sm font-bold text-slate-900">
                        {index + 1}. {prompt}
                      </p>
                      {worksheetIndex === 0 ? (
                        <div className="grid gap-2 sm:grid-cols-[11rem_1fr] print:grid-cols-[11rem_1fr]">
                          <div className="qp-answer-box rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">
                            {isKo ? "내 분류" : "My type"}
                          </div>
                          <div className="qp-answer-box rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">
                            {isKo ? "그렇게 생각한 까닭" : "My reason"}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="qp-write-line h-8 border-b border-slate-400" />
                          <div className="qp-write-line h-8 border-b border-slate-400" />
                        </div>
                      )}
                      {worksheetIndex === 2 && index === worksheet.prompts.length - 1 && (
                        <div className="qp-discussion-check mt-1 flex flex-wrap gap-3 text-xs font-semibold text-slate-700">
                          <span>□ {isKo ? "친구와 토의하고 싶은 질문" : "Question I want to discuss"}</span>
                          <span>□ {isKo ? "더 고쳐 보고 싶은 질문" : "Question I want to improve"}</span>
                        </div>
                      )}
                      </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}
