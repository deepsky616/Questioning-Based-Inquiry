"use client";

import { useTranslations, useLocale } from "next-intl";
import type { ReportTotals } from "@/lib/report-stats";
import type { QuestionTypeSummary } from "@/lib/stats-calc";
import type { SessionAnalysisResult } from "@/components/reports/ReportView";

export interface PrintReportItem {
  name: string;
  grade?: string | null;
  className?: string | null;
  studentNumber?: string | null;
  school?: string | null;
  totals: ReportTotals;
  classification: QuestionTypeSummary;
  sessions: { id: string; date: string; subject: string; topic: string; analysis?: SessionAnalysisResult | null }[];
}

// 인쇄 전용 리포트 문서: 머리글 + 수치 표 + 질문 분류 표 + 모든 세션 AI 분석.
// 차트 없이 압축 양식, 라이트 강제, 학생마다 새 페이지. 화면에선 .print-only로 숨김.
export function ReportPrintDoc({ items }: { items: PrintReportItem[] }) {
  const t = useTranslations("report");
  const tCls = useTranslations("classification");
  const locale = useLocale();
  const today = new Date().toLocaleDateString(locale);

  const metrics = (totals: ReportTotals) => [
    [t("metric_questions"), totals.questions],
    [t("metric_likesGiven"), totals.likesGiven],
    [t("metric_comments"), totals.comments],
    [t("metric_likesReceived"), totals.likesReceived],
    [t("metric_commentsReceived"), totals.commentsReceived],
  ] as const;

  const blocksOf = (a: SessionAnalysisResult): [string, string | undefined][] => [
    [t("secSummary"), a.summary],
    [t("secBalance"), a.balanceInsights],
    [t("secBest"), a.bestQuestion],
    [t("secGrowth"), a.growthInsights],
    [t("secRewrite"), a.rewriteExample],
    [t("secEngagement"), a.engagementInsights],
    [t("secComment"), a.commentInsights],
    [t("secRelevance"), a.relevanceInsights],
    [t("secNext"), a.nextQuestions],
    [t("secSuggest"), a.insights],
  ];

  return (
    <div className="report-doc">
      {items.map((it, idx) => {
        const sub = [
          it.grade && t("gradeLabel", { grade: it.grade }),
          it.className && t("classLabel", { className: it.className }),
          it.studentNumber && t("numberLabel", { n: it.studentNumber }),
        ].filter(Boolean).join(" ");
        const analyzed = it.sessions.filter((s) => s.analysis && blocksOf(s.analysis).some(([, v]) => v && v.trim()));
        return (
          <section key={idx} className="report-doc-page">
            {/* 머리글 */}
            <header className="report-doc-head">
              <h1>{t("docTitle")}</h1>
              <div className="report-doc-meta">
                <strong>{it.name}</strong>
                {sub && <span> · {sub}</span>}
                {it.school && <span> · {it.school}</span>}
                <span> · {t("docGenerated", { date: today })}</span>
              </div>
            </header>

            {/* 활동 요약 수치 */}
            <h2 className="report-doc-h2">{t("docSummary")}</h2>
            <table className="report-doc-table">
              <tbody>
                <tr>{metrics(it.totals).map(([label]) => <th key={label}>{label}</th>)}</tr>
                <tr>{metrics(it.totals).map(([label, v]) => <td key={label}>{v}</td>)}</tr>
              </tbody>
            </table>

            {/* 질문 분류 */}
            <h2 className="report-doc-h2">{t("docClassification")}</h2>
            <table className="report-doc-table">
              <tbody>
                <tr>
                  <th>{tCls("closed.label")}</th><th>{tCls("open.label")}</th>
                  <th>{tCls("factual.label")}</th><th>{tCls("conceptual.label")}</th><th>{tCls("controversial.label")}</th>
                </tr>
                <tr>
                  <td>{it.classification.closure.closed}</td><td>{it.classification.closure.open}</td>
                  <td>{it.classification.cognitive.factual}</td><td>{it.classification.cognitive.conceptual}</td><td>{it.classification.cognitive.controversial}</td>
                </tr>
              </tbody>
            </table>

            {/* 세션별 AI 분석(모두 포함) */}
            <h2 className="report-doc-h2">{t("docSessions")}</h2>
            {analyzed.length === 0 ? (
              <p className="report-doc-empty">{t("docNoAnalysis")}</p>
            ) : (
              analyzed.map((s) => (
                <div key={s.id} className="report-doc-session">
                  <h3>{s.date} · {s.subject}{s.topic ? ` - ${s.topic}` : ""}</h3>
                  {blocksOf(s.analysis as SessionAnalysisResult).filter(([, v]) => v && v.trim()).map(([h, v]) => (
                    <div key={h} className="report-doc-block">
                      <p className="report-doc-block-h">{h}</p>
                      <p className="report-doc-block-b">{v}</p>
                    </div>
                  ))}
                </div>
              ))
            )}
            {idx < items.length - 1 && <div className="report-doc-break" />}
          </section>
        );
      })}
    </div>
  );
}
