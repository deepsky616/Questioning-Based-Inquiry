"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionToggle } from "@/components/shared/SectionToggle";

interface SessionAnalysis {
  summary: string;
  themes: string[];
  insights: string;
  commentInsights?: string;
  engagementInsights?: string;
  relevanceInsights?: string;
  balanceInsights?: string;
  bestQuestion?: string;
  nextQuestions?: string;
  totalQuestions: number;
  totalComments?: number;
  totalLikes?: number;
}

interface SessionAnalysisCardProps {
  /** 분석할 수업세션 id — 부모에서 key로도 넘겨 세션 변경 시 상태를 초기화한다 */
  sessionId: string;
}

/**
 * AI 세션 분석 카드 (질문 조회 탭).
 * 마운트 시 저장된 학급 분석을 불러오고(대시보드와 공유), 재분석 요청과
 * 교사 인라인 수정(대시보드 상세 리포트와 동일)을 자체 상태로 처리한다.
 */
export function SessionAnalysisCard({ sessionId }: SessionAnalysisCardProps) {
  const t = useTranslations("teacherQ");
  const tc = useTranslations("common");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [show, setShow] = useState(false);
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 마운트 시 저장된 학급 AI 분석을 불러온다(세션 변경은 key 리마운트로 처리)
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    fetch(`/api/sessions/${sessionId}/analysis`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        setAnalysis(d?.analysis ? (d.analysis as SessionAnalysis) : null);
        setError(null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [sessionId]);

  const handleAnalyze = async () => {
    if (!sessionId) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("sessionAnalysisFailed"));
      setAnalysis(data as SessionAnalysis);
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : t("sessionAnalysisFailed"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 세션 분석 교사 수정(대시보드 상세 리포트와 동일하게)
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const startEdit = () => {
    if (!analysis) return;
    setEditDraft({
      summary: analysis.summary ?? "",
      balanceInsights: analysis.balanceInsights ?? "",
      bestQuestion: analysis.bestQuestion ?? "",
      engagementInsights: analysis.engagementInsights ?? "",
      commentInsights: analysis.commentInsights ?? "",
      relevanceInsights: analysis.relevanceInsights ?? "",
      nextQuestions: analysis.nextQuestions ?? "",
      insights: analysis.insights ?? "",
    });
    setShow(true);
    setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setEditDraft({}); };
  const saveEdit = async () => {
    if (!sessionId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reports/session-analysis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, scope: "class", result: { ...(analysis ?? {}), ...editDraft } }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t("sessionAnalysisFailed"));
      setAnalysis((prev) => (prev ? { ...prev, ...editDraft } : prev));
      setEditing(false);
      setEditDraft({});
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sessionAnalysisFailed"));
    } finally {
      setSaving(false);
    }
  };
  const editFields: [string, string][] = [
    ["summary", t("summaryTitle")],
    ["balanceInsights", t("balanceTitle")],
    ["bestQuestion", t("bestTitle")],
    ["engagementInsights", t("engagementTitle")],
    ["commentInsights", t("commentInsightsTitle")],
    ["relevanceInsights", t("relevanceTitle")],
    ["nextQuestions", t("nextTitle")],
    ["insights", t("insightsTitle")],
  ];

  return (
    <Card>
      {/* 헤더 여백 어디를 눌러도 접기/펼치기 (수정·재분석 등 버튼 클릭은 제외) */}
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          setShow((v) => !v);
        }}
      >
        <div className="flex items-center justify-between">
          <SectionToggle
            title={t("sessionAnalysisTitle")}
            open={show}
            onToggle={() => setShow((v) => !v)}
          />
          {editing ? (
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={saving} onClick={saveEdit} className="text-xs">{tc("save")}</Button>
              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={cancelEdit} className="text-xs">{tc("cancel")}</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {analysis && !isAnalyzing && (
                <Button type="button" size="sm" variant="outline" onClick={startEdit} className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50">{t("editAnalysisBtn")}</Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isAnalyzing}
                onClick={handleAnalyze}
                className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                {isAnalyzing ? t("analyzing") : analysis ? t("reanalyzeBtn") : t("analyze")}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      {show && (analysis || error || editing) && (
        <CardContent className="space-y-4">
          {editing ? (
            <div className="space-y-3">
              {editFields.map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-foreground">{label}</label>
                  <textarea
                    value={editDraft[key] ?? ""}
                    onChange={(e) => setEditDraft((d) => ({ ...d, [key]: e.target.value }))}
                    rows={2}
                    className="mt-0.5 w-full rounded-md border bg-background px-2 py-1 text-sm leading-6 text-foreground"
                  />
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : analysis ? (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{t("statQuestions", { count: analysis.totalQuestions ?? 0 })}</span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{t("statLikes", { count: analysis.totalLikes ?? 0 })}</span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{t("statComments", { count: analysis.totalComments ?? 0 })}</span>
              </div>
              <div className="rounded-lg bg-muted p-4 text-sm leading-6 text-foreground">{analysis.summary}</div>
              <div className="flex flex-wrap gap-2">
                {(analysis.themes ?? []).map((theme) => (
                  <span key={theme} className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">{theme}</span>
                ))}
              </div>
              {analysis.balanceInsights && (
                <div className="rounded-lg bg-violet-50 p-4 dark:bg-violet-950/30">
                  <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">{t("balanceTitle")}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-violet-950 dark:text-violet-100">{analysis.balanceInsights}</p>
                </div>
              )}
              {analysis.bestQuestion && (
                <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-950/30">
                  <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300">{t("bestTitle")}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-yellow-950 dark:text-yellow-100">{analysis.bestQuestion}</p>
                </div>
              )}
              <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/30">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{t("insightsTitle")}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950 dark:text-amber-100">{analysis.insights}</p>
              </div>
              {analysis.nextQuestions && (
                <div className="rounded-lg bg-indigo-50 p-4 dark:bg-indigo-950/30">
                  <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">{t("nextTitle")}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-indigo-950 dark:text-indigo-100">{analysis.nextQuestions}</p>
                </div>
              )}
              {analysis.engagementInsights && (
                <div className="rounded-lg bg-rose-50 p-4 dark:bg-rose-950/30">
                  <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">{t("engagementTitle")}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-rose-950 dark:text-rose-100">{analysis.engagementInsights}</p>
                </div>
              )}
              {analysis.commentInsights && (
                <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/30">
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{t("commentInsightsTitle")}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950 dark:text-emerald-100">{analysis.commentInsights}</p>
                </div>
              )}
              {analysis.relevanceInsights && (
                <div className="rounded-lg bg-sky-50 p-4 dark:bg-sky-950/30">
                  <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">{t("relevanceTitle")}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sky-950 dark:text-sky-100">{analysis.relevanceInsights}</p>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}
