"use client";

// 질문 유형 알아보기 — "질문 탐정단" 학습 가이드.
// 열린/닫힌 질문, 유형별 눈높이 정의와 만들기 공식(쓰는 말·끝맺는 말·예시),
// 질문 3형제 비교표, 탐구자 3단계. 콘텐츠는 question-detective-content(한국어 고정).
import { useTranslations } from "next-intl";
import {
  QUESTION_TYPE_FORMULA_GUIDE,
  QUESTION_TRIO_TABLE,
  INQUIRY_STEPS,
} from "@/lib/question-detective-content";
import type { Cognitive } from "@/lib/question-practice-data";

const TYPE_ACCENT: Record<Cognitive, { title: string; badge: string }> = {
  factual: {
    title: "text-sky-700 dark:text-sky-300",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  },
  conceptual: {
    title: "text-indigo-700 dark:text-indigo-300",
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300",
  },
  controversial: {
    title: "text-rose-700 dark:text-rose-300",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  },
};

export function QuestionTypeGuide() {
  const t = useTranslations("practice");
  const tCls = useTranslations("classification");

  return (
    <div className="mt-4 space-y-4 text-sm">
      {/* 열린/닫힌 질문 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <p className="font-semibold text-blue-700 dark:text-blue-300">{tCls("closed.label")}</p>
          <p className="text-muted-foreground mt-1">{t("learnClosed")}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">{tCls("open.label")}</p>
          <p className="text-muted-foreground mt-1">{t("learnOpen")}</p>
        </div>
      </div>

      {/* 유형별 정의 + 만들기 공식 */}
      <div className="space-y-3">
        {QUESTION_TYPE_FORMULA_GUIDE.map((guide) => {
          const accent = TYPE_ACCENT[guide.typeKey];
          return (
            <div key={guide.typeKey} className="rounded-lg border p-3 space-y-2.5">
              <p className={`font-semibold ${accent.title}`}>{tCls(`${guide.typeKey}.label`)}</p>
              <p className="text-muted-foreground">{guide.definition}</p>
              <p className="text-xs font-semibold text-foreground">🔑 {t("guideFormulaTitle")}</p>
              <div className="space-y-2">
                {guide.formulas.map((formula) => (
                  <div key={formula.icon} className="rounded-md bg-muted/40 p-2.5 text-xs space-y-1">
                    <p className="font-medium text-foreground">{formula.icon} {formula.title}</p>
                    <p className="text-muted-foreground">
                      <span className="font-medium">{t("guideWordsLabel")}:</span> {formula.words}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium">{t("guidePatternLabel")}:</span> {formula.pattern}
                    </p>
                    <div className="text-muted-foreground">
                      <span className="font-medium">{t("guideExampleLabel")}:</span>
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                        {formula.examples.map((example) => (
                          <li key={example}>{example}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 질문 3형제 비교표 */}
      <div className="rounded-lg border p-3">
        <p className="font-semibold">{t("guideTableTitle")}</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">{t("guideTableType")}</th>
                <th className="py-1.5 pr-3 font-medium">{t("guideTableTools")}</th>
                <th className="py-1.5 pr-3 font-medium">{t("guideTablePurpose")}</th>
                <th className="py-1.5 font-medium">{t("guideTableExample")}</th>
              </tr>
            </thead>
            <tbody>
              {QUESTION_TRIO_TABLE.map((row) => (
                <tr key={row.typeKey} className="border-b last:border-b-0">
                  <td className="py-1.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TYPE_ACCENT[row.typeKey].badge}`}>
                      {tCls(`${row.typeKey}.label`)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{row.tools}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{row.purpose}</td>
                  <td className="py-1.5 text-muted-foreground">{row.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 멋진 탐구자가 되는 3단계 */}
      <div className="rounded-lg bg-muted/40 p-3">
        <p className="font-medium">{t("guideStepsTitle")}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {INQUIRY_STEPS.map((step) => (
            <div key={step.step} className="rounded-md border bg-card p-2.5 text-xs">
              <p className="font-semibold text-foreground">
                <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white">
                  {step.step}
                </span>
                {step.title}
              </p>
              <p className="text-muted-foreground mt-1">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
