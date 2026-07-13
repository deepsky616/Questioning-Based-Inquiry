"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getQuestionPracticePrintGuide } from "@/lib/question-practice-print-guide";

export default function TeacherPracticePrintGuidePage() {
  const locale = useLocale();
  const guide = getQuestionPracticePrintGuide(locale);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-sm">
        <Button asChild variant="outline" className="gap-2">
          <Link href="/teacher-practice">
            <ArrowLeft className="h-4 w-4" />
            {guide.backButton}
          </Link>
        </Button>
        <Button onClick={() => window.print()} className="gap-2 font-semibold">
          <Printer className="h-4 w-4" />
          {guide.printButton}
        </Button>
      </div>

      <article className="question-practice-print rounded-xl border bg-white p-6 text-slate-950 shadow-sm [color-scheme:light] dark:bg-white dark:text-slate-950 print:border-0 print:p-0 print:shadow-none">
        <div className="border-b border-slate-300 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-700">{guide.eyebrow}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-extrabold leading-tight text-slate-950">{guide.title}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-700">{guide.subtitle}</p>
            </div>
            <div className="w-full max-w-xs space-y-2 text-sm text-slate-700 print:max-w-64">
              <div className="flex items-center gap-2">
                <span className="w-20 font-semibold">{guide.classLabel}</span>
                <span className="h-7 flex-1 border-b border-slate-400" />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 font-semibold">{guide.nameLabel}</span>
                <span className="h-7 flex-1 border-b border-slate-400" />
              </div>
            </div>
          </div>
          <p className="mt-4 rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 print:bg-indigo-50">
            {guide.teacherNote}
          </p>
        </div>

        <section className="mt-6 space-y-4">
          <h2 className="text-xl font-extrabold text-slate-950">{guide.guideTitle}</h2>
          <div className="grid gap-4">
            {guide.sections.map((section) => (
              <section
                key={section.title}
                className="break-inside-avoid rounded-lg border border-slate-300 p-4 print:rounded-none"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-3xl">
                    <h3 className="text-lg font-extrabold text-slate-950">{section.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{section.summary}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {section.note}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3 print:grid-cols-3">
                  {section.patterns.map((pattern) => (
                    <div key={pattern.title} className="rounded-md border border-slate-200 p-3">
                      <h4 className="text-sm font-extrabold text-slate-950">{pattern.title}</h4>
                      <div className="mt-2 space-y-2 text-xs leading-5 text-slate-700">
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

        <section className="mt-7 space-y-4">
          <h2 className="text-xl font-extrabold text-slate-950">{guide.worksheetTitle}</h2>
          <div className="grid gap-4">
            {guide.worksheets.map((worksheet) => (
              <section
                key={worksheet.title}
                className="break-inside-avoid rounded-lg border border-slate-300 p-4 print:rounded-none"
              >
                <h3 className="text-base font-extrabold text-slate-950">{worksheet.title}</h3>
                <p className="mt-1 text-sm text-slate-700">{worksheet.directions}</p>
                <div className="mt-4 space-y-4">
                  {worksheet.prompts.map((prompt, index) => (
                    <div key={prompt} className="grid gap-2">
                      <p className="text-sm font-bold text-slate-900">
                        {index + 1}. {prompt}
                      </p>
                      <div className="space-y-2">
                        <div className="h-7 border-b border-slate-300" />
                        <div className="h-7 border-b border-slate-300" />
                      </div>
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
