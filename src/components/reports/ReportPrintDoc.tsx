"use client";

import { useTranslations, useLocale } from "next-intl";
import type { ReportTotals, SeriesPoint } from "@/lib/report-stats";
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
  weekly?: SeriesPoint[];
  monthly?: SeriesPoint[];
  sessions: { id: string; date: string; subject: string; topic: string; analysis?: SessionAnalysisResult | null }[];
}

// 인쇄 전용 리포트 문서: 레터헤드 + KPI 카드 + 질문 분류 막대 + 세션별 AI 분석.
// 차트(recharts) 대신 CSS 막대를 써 인쇄 안정성을 확보하고, 라이트 색을 강제한다.
export function ReportPrintDoc({ items }: { items: PrintReportItem[] }) {
  const t = useTranslations("report");
  const tCls = useTranslations("classification");
  const locale = useLocale();
  const today = new Date().toLocaleDateString(locale);

  const kpis = (totals: ReportTotals) => [
    { label: t("metric_questions"), v: totals.questions, color: "#6366f1" },
    { label: t("metric_likesGiven"), v: totals.likesGiven, color: "#f43f5e" },
    { label: t("metric_comments"), v: totals.comments, color: "#10b981" },
    { label: t("metric_likesReceived"), v: totals.likesReceived, color: "#f59e0b" },
    { label: t("metric_commentsReceived"), v: totals.commentsReceived, color: "#8b5cf6" },
  ];

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

  const analyzedCount = (it: PrintReportItem) =>
    it.sessions.filter((s) => s.analysis && blocksOf(s.analysis).some(([, v]) => v && v.trim())).length;

  // 추세는 월별 우선, 없으면 주별
  const trendOf = (it: PrintReportItem): SeriesPoint[] => (it.monthly && it.monthly.length ? it.monthly : it.weekly ?? []);

  const showRoster = items.length > 1;

  const bar = (label: string, value: number, groupTotal: number, color: string) => {
    const pct = groupTotal > 0 ? Math.round((value / groupTotal) * 100) : 0;
    return (
      <div className="report-doc-bar-row" key={label}>
        <span className="report-doc-bar-label">{label}</span>
        <span className="report-doc-bar-track">
          <span className="report-doc-bar-fill" style={{ width: `${pct}%`, background: color }} />
        </span>
        <span className="report-doc-bar-val">{value} ({pct}%)</span>
      </div>
    );
  };

  const rosterHead = items[0];
  const rosterSub = rosterHead ? [
    rosterHead.grade && t("gradeLabel", { grade: rosterHead.grade }),
    rosterHead.className && t("classLabel", { className: rosterHead.className }),
    rosterHead.school,
  ].filter(Boolean).join(" · ") : "";

  return (
    <div className="report-doc">
      {/* 전체 출력일 때 맨 앞 학급 요약 표 */}
      {showRoster && (
        <section className="report-doc-page">
          <header className="report-doc-head">
            <div className="report-doc-head-row">
              <h1>{t("docRosterTitle")}</h1>
              <span className="report-doc-date">{t("docGenerated", { date: today })}</span>
            </div>
            {rosterSub && <div className="report-doc-meta">{rosterSub}</div>}
          </header>
          <table className="report-doc-table report-doc-roster">
            <thead>
              <tr>
                <th>{t("docColNo")}</th><th className="report-doc-td-l">{t("docColName")}</th>
                <th>{t("metric_questions")}</th><th>{t("metric_likesGiven")}</th><th>{t("metric_comments")}</th>
                <th>{t("metric_likesReceived")}</th><th>{t("metric_commentsReceived")}</th><th>{t("docColAnalyzed")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>{it.studentNumber ?? "-"}</td><td className="report-doc-td-l">{it.name}</td>
                  <td>{it.totals.questions}</td><td>{it.totals.likesGiven}</td><td>{it.totals.comments}</td>
                  <td>{it.totals.likesReceived}</td><td>{it.totals.commentsReceived}</td><td>{analyzedCount(it)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="report-doc-break" />
        </section>
      )}

      {items.map((it, idx) => {
        const sub = [
          it.grade && t("gradeLabel", { grade: it.grade }),
          it.className && t("classLabel", { className: it.className }),
          it.studentNumber && t("numberLabel", { n: it.studentNumber }),
        ].filter(Boolean).join(" ");
        const cl = it.classification;
        const closureTotal = cl.closure.closed + cl.closure.open;
        const cogTotal = cl.cognitive.factual + cl.cognitive.conceptual + cl.cognitive.controversial;
        const analyzed = it.sessions.filter((s) => s.analysis && blocksOf(s.analysis).some(([, v]) => v && v.trim()));
        return (
          <section key={idx} className="report-doc-page">
            {/* 레터헤드 */}
            <header className="report-doc-head">
              <div className="report-doc-head-row">
                <h1>{t("docTitle")}</h1>
                <span className="report-doc-date">{t("docGenerated", { date: today })}</span>
              </div>
              <div className="report-doc-meta">
                <strong>{it.name}</strong>
                {sub && <span> · {sub}</span>}
                {it.school && <span> · {it.school}</span>}
              </div>
            </header>

            {/* 활동 요약 KPI */}
            <h2 className="report-doc-h2">{t("docSummary")}</h2>
            <div className="report-doc-kpis">
              {kpis(it.totals).map((k) => (
                <div className="report-doc-kpi" key={k.label}>
                  <div className="report-doc-kpi-v" style={{ color: k.color }}>{k.v}</div>
                  <div className="report-doc-kpi-l">{k.label}</div>
                </div>
              ))}
            </div>

            {/* 질문 분류(막대) */}
            <h2 className="report-doc-h2">{t("docClassification")}</h2>
            <div className="report-doc-bars">
              {bar(tCls("closed.label"), cl.closure.closed, closureTotal, "#3b82f6")}
              {bar(tCls("open.label"), cl.closure.open, closureTotal, "#10b981")}
              <div className="report-doc-bar-sep" />
              {bar(tCls("factual.label"), cl.cognitive.factual, cogTotal, "#94a3b8")}
              {bar(tCls("conceptual.label"), cl.cognitive.conceptual, cogTotal, "#a855f7")}
              {bar(tCls("controversial.label"), cl.cognitive.controversial, cogTotal, "#f97316")}
            </div>

            {/* 활동 추세 표 */}
            {trendOf(it).length > 0 && (
              <>
                <h2 className="report-doc-h2">{t("docTrendTitle")}</h2>
                <table className="report-doc-table">
                  <thead>
                    <tr>
                      <th className="report-doc-td-l">{t("docTrendPeriod")}</th>
                      <th>{t("metric_questions")}</th><th>{t("metric_likesGiven")}</th><th>{t("metric_comments")}</th>
                      <th>{t("metric_likesReceived")}</th><th>{t("metric_commentsReceived")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendOf(it).map((p) => (
                      <tr key={p.key}>
                        <td className="report-doc-td-l">{p.label}</td>
                        <td>{p.questions}</td><td>{p.likesGiven}</td><td>{p.comments}</td>
                        <td>{p.likesReceived}</td><td>{p.commentsReceived}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h2 className="report-doc-h2">{t("docClassTrendTitle")}</h2>
                <table className="report-doc-table">
                  <thead>
                    <tr>
                      <th className="report-doc-td-l">{t("docTrendPeriod")}</th>
                      <th>{tCls("closed.label")}</th><th>{tCls("open.label")}</th>
                      <th>{tCls("factual.label")}</th><th>{tCls("conceptual.label")}</th><th>{tCls("controversial.label")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendOf(it).map((p) => (
                      <tr key={p.key}>
                        <td className="report-doc-td-l">{p.label}</td>
                        <td>{p.closed}</td><td>{p.open}</td>
                        <td>{p.factual}</td><td>{p.conceptual}</td><td>{p.controversial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

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
