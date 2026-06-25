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

// 인쇄 전용 리포트 문서 — '채점 결과 리포트' 양식(보라 타이틀 밴드 + 라벤더 표 + 피드백 박스)을
// 활동 리포트 데이터에 적용. 차트 대신 표로 인쇄 안정성 확보, 라이트 색 강제.
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

  const analyzedSessions = (it: PrintReportItem) =>
    it.sessions.filter((s) => s.analysis && blocksOf(s.analysis).some(([, v]) => v && v.trim()));
  const trendOf = (it: PrintReportItem): SeriesPoint[] => (it.monthly && it.monthly.length ? it.monthly : it.weekly ?? []);
  const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const showRoster = items.length > 1;

  // 학교 · 학년 · 반 · 번호를 모두 표시(이름은 제목에 별도 표시)
  const idLine = (it: PrintReportItem) =>
    [
      it.school,
      it.grade != null && it.grade !== "" ? t("docGrade", { grade: it.grade }) : "",
      it.className != null && it.className !== "" ? t("docClass", { className: it.className }) : "",
      it.studentNumber != null && it.studentNumber !== "" ? t("docNumber", { n: it.studentNumber }) : "",
    ].filter(Boolean).join(" · ");

  return (
    <div className="rdoc">
      {/* 전체 출력: 맨 앞 학급 요약 */}
      {showRoster && items[0] && (
        <section className="rdoc-page">
          <div className="rdoc-bar" />
          <div className="rdoc-band">
            <div className="rdoc-eyebrow">{idLine(items[0])}</div>
            <h1 className="rdoc-title"><span className="rdoc-accent">{t("docRosterTitle")}</span></h1>
            <div className="rdoc-gen">{t("docGenerated", { date: today })}</div>
          </div>
          <table className="rdoc-table">
            <thead>
              <tr>
                <th>{t("docColNo")}</th><th className="rdoc-l">{t("docColName")}</th>
                <th>{t("metric_questions")}</th><th>{t("metric_likesGiven")}</th><th>{t("metric_comments")}</th>
                <th>{t("metric_likesReceived")}</th><th>{t("metric_commentsReceived")}</th><th>{t("docColAnalyzed")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>{it.studentNumber ?? "-"}</td><td className="rdoc-l">{it.name}</td>
                  <td>{it.totals.questions}</td><td>{it.totals.likesGiven}</td><td>{it.totals.comments}</td>
                  <td>{it.totals.likesReceived}</td><td>{it.totals.commentsReceived}</td><td>{analyzedSessions(it).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rdoc-break" />
        </section>
      )}

      {items.map((it, idx) => {
        const cl = it.classification;
        const closureTotal = cl.closure.closed + cl.closure.open;
        const cogTotal = cl.cognitive.factual + cl.cognitive.conceptual + cl.cognitive.controversial;
        const trend = trendOf(it);
        const analyzed = analyzedSessions(it);
        return (
          <section key={idx} className="rdoc-page">
            <div className="rdoc-bar" />
            <div className="rdoc-band">
              <div className="rdoc-eyebrow">{idLine(it)}</div>
              <h1 className="rdoc-title">{it.name} <span className="rdoc-accent">{t("docTitle")}</span></h1>
              <div className="rdoc-gen">{t("docGenerated", { date: today })}</div>
            </div>

            {/* 활동 요약 KPI */}
            <div className="rdoc-section-label">{t("docSummary")}</div>
            <div className="rdoc-kpis">
              {kpis(it.totals).map((k) => (
                <div className="rdoc-kpi" key={k.label}>
                  <div className="rdoc-kpi-v" style={{ color: k.color }}>{k.v}</div>
                  <div className="rdoc-kpi-l">{k.label}</div>
                </div>
              ))}
            </div>

            {/* 질문 분류(영역·유형·개수·비율) */}
            <div className="rdoc-section-label">{t("docClassification")}</div>
            <table className="rdoc-table">
              <thead>
                <tr>
                  <th className="rdoc-l">{t("docColDomain")}</th><th className="rdoc-l">{t("docColType")}</th>
                  <th>{t("docColCount")}</th><th>{t("docColRatio")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="rdoc-l" rowSpan={2}>{t("docDomainClosure")}</td>
                  <td className="rdoc-l">{tCls("closed.label")}</td><td>{cl.closure.closed}</td><td>{pct(cl.closure.closed, closureTotal)}%</td>
                </tr>
                <tr><td className="rdoc-l">{tCls("open.label")}</td><td>{cl.closure.open}</td><td>{pct(cl.closure.open, closureTotal)}%</td></tr>
                <tr>
                  <td className="rdoc-l" rowSpan={3}>{t("docDomainCognitive")}</td>
                  <td className="rdoc-l">{tCls("factual.label")}</td><td>{cl.cognitive.factual}</td><td>{pct(cl.cognitive.factual, cogTotal)}%</td>
                </tr>
                <tr><td className="rdoc-l">{tCls("conceptual.label")}</td><td>{cl.cognitive.conceptual}</td><td>{pct(cl.cognitive.conceptual, cogTotal)}%</td></tr>
                <tr><td className="rdoc-l">{tCls("controversial.label")}</td><td>{cl.cognitive.controversial}</td><td>{pct(cl.cognitive.controversial, cogTotal)}%</td></tr>
              </tbody>
            </table>

            {/* 추세 표 */}
            {trend.length > 0 && (
              <>
                <div className="rdoc-section-label">{t("docTrendTitle")}</div>
                <table className="rdoc-table">
                  <thead>
                    <tr>
                      <th className="rdoc-l">{t("docTrendPeriod")}</th>
                      <th>{t("metric_questions")}</th><th>{t("metric_likesGiven")}</th><th>{t("metric_comments")}</th>
                      <th>{t("metric_likesReceived")}</th><th>{t("metric_commentsReceived")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((p) => (
                      <tr key={p.key}>
                        <td className="rdoc-l">{p.label}</td>
                        <td>{p.questions}</td><td>{p.likesGiven}</td><td>{p.comments}</td>
                        <td>{p.likesReceived}</td><td>{p.commentsReceived}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="rdoc-section-label">{t("docClassTrendTitle")}</div>
                <table className="rdoc-table">
                  <thead>
                    <tr>
                      <th className="rdoc-l">{t("docTrendPeriod")}</th>
                      <th>{tCls("closed.label")}</th><th>{tCls("open.label")}</th>
                      <th>{tCls("factual.label")}</th><th>{tCls("conceptual.label")}</th><th>{tCls("controversial.label")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trend.map((p) => (
                      <tr key={p.key}>
                        <td className="rdoc-l">{p.label}</td>
                        <td>{p.closed}</td><td>{p.open}</td>
                        <td>{p.factual}</td><td>{p.conceptual}</td><td>{p.controversial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* 세션별 AI 분석 — 피드백 박스 */}
            <div className="rdoc-section-label">{t("docSessions")}</div>
            {analyzed.length === 0 ? (
              <p className="rdoc-empty">{t("docNoAnalysis")}</p>
            ) : (
              analyzed.map((s) => (
                <div key={s.id} className="rdoc-feedback">
                  <h3 className="rdoc-feedback-h">{s.date} · {s.subject}{s.topic ? ` - ${s.topic}` : ""}</h3>
                  {blocksOf(s.analysis as SessionAnalysisResult).filter(([, v]) => v && v.trim()).map(([h, v]) => (
                    <div key={h} className="rdoc-fb-block">
                      <p className="rdoc-fb-h">{h}</p>
                      <p className="rdoc-fb-b">{v}</p>
                    </div>
                  ))}
                </div>
              ))
            )}
            {idx < items.length - 1 && <div className="rdoc-break" />}
          </section>
        );
      })}
    </div>
  );
}
