"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACTIVITY_BONUS_TYPES } from "@/lib/activity-bonus-policy";
import { buildSessionLabel } from "@/lib/sessions";
import { EmptyState } from "@/components/shared/EmptyState";

interface SessionItem { id: string; date: string; subject: string; topic: string }
interface PendingLog {
  id: string; studentId: string; studentName: string;
  grade: string | null; className: string | null;
  bonusType: string; points: number; reason: string;
  sessionId: string | null;
  relatedQuestionId: string | null;
  relatedCommentId: string | null;
  questionContent: string;
  questionLikeCount: number | null;
  commentContent: string;
  aiAnalysis: string | null;
  createdAt: string;
  alreadyForTarget: number;
  alreadyInSession: number;
}
type AnalyzeResponse = {
  createdPending?: number;
  questionCount?: number;
  commentCount?: number;
  aiStatus?: "success" | "skipped" | "failed";
  aiErrorType?: "missing_key" | "busy" | "invalid_response" | "unknown" | null;
  fallbackUsed?: boolean;
  error?: string;
};

// 라벨은 번역키(labelKey)로 반환하고 표시 시점에 t로 해석. 미지정 타입은 raw 노출.
function bonusLabel(bt: string): { labelKey: string | null; raw: string; emoji: string; color: string } {
  const stripped = bt.replace(/^AI_/, "");
  if (stripped in ACTIVITY_BONUS_TYPES) {
    const def = ACTIVITY_BONUS_TYPES[stripped as keyof typeof ACTIVITY_BONUS_TYPES];
    return {
      labelKey: `review_${stripped}`,
      raw: bt,
      emoji: def.emoji,
      color: stripped === "DUPLICATE_FLAGGED" ? "#ef4444" : "#6366f1",
    };
  }
  return { labelKey: null, raw: bt, emoji: "🎯", color: "#6366f1" };
}

export function PointReviewView() {
  const t = useTranslations("pointReview");
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("all");
  const [pending, setPending] = useState<PendingLog[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [overrideEdit, setOverrideEdit] = useState<Record<string, number>>({});
  const focusStudentId = searchParams.get("studentId");

  const loadSessions = useCallback(() => {
    fetch("/api/sessions").then((r) => r.json()).then((d) => {
      setSessions(Array.isArray(d) ? d : (d.sessions ?? []));
    }).catch(() => {});
  }, []);

  const loadPending = useCallback(() => {
    const url = selectedSessionId === "all"
      ? "/api/teacher/points/pending"
      : `/api/teacher/points/pending?sessionId=${selectedSessionId}`;
    fetch(url).then((r) => r.json()).then((d) => {
      setPending(d.pending ?? []);
      setSelected(new Set());
    }).catch(() => {});
  }, [selectedSessionId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { setSelected(new Set()); }, [focusStudentId]);

  async function runAnalyze() {
    if (selectedSessionId === "all") {
      setMessage(t("selectSessionFirst"));
      return;
    }
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/teacher/points/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });
      const data = await res.json() as AnalyzeResponse;
      if (res.ok) {
        if (data.aiStatus === "failed") {
          const fallback = data.fallbackUsed ? ` ${t("fallbackUsed")}` : "";
          const key = data.aiErrorType === "missing_key"
            ? "aiErrorMissingKey"
            : data.aiErrorType === "busy"
            ? "aiErrorBusy"
            : data.aiErrorType === "invalid_response"
            ? "aiErrorInvalidResponse"
            : "aiErrorUnknown";
          setMessage(`${t(key)}${fallback}`);
        } else {
          setMessage(t("analyzeDone", { created: data.createdPending ?? 0, questions: data.questionCount ?? 0, comments: data.commentCount ?? 0 }));
        }
        loadPending();
      } else {
        setMessage(data.error || t("analyzeFailed"));
      }
    } catch { setMessage(t("networkError")); }
    finally { setBusy(false); }
  }

  async function decide(decision: "APPROVE" | "REJECT", ids?: string[]) {
    const targetIds = ids ?? Array.from(selected);
    if (targetIds.length === 0) return;
    setBusy(true);
    try {
      await fetch("/api/teacher/points/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targetIds, decision }),
      });
      setMessage(decision === "APPROVE" ? t("resultApproved", { count: targetIds.length }) : t("resultRejected", { count: targetIds.length }));
      loadPending();
      queryClient.invalidateQueries({ queryKey: ["pending-review-count"] });
      queryClient.invalidateQueries({ queryKey: ["flagged-count"] });
    } catch {} finally { setBusy(false); }
  }

  async function decideWithOverride(logId: string, points: number) {
    setBusy(true);
    try {
      await fetch("/api/teacher/points/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [logId], decision: "APPROVE", overridePoints: points }),
      });
      setMessage(t("overrideApproved", { points }));
      loadPending();
      queryClient.invalidateQueries({ queryKey: ["pending-review-count"] });
    } catch {} finally { setBusy(false); }
  }

  const duplicateRows = pending.filter((p) => p.bonusType.includes("DUPLICATE"));
  const normalRows = pending.filter((p) => !p.bonusType.includes("DUPLICATE"));
  const focusedPending = focusStudentId ? pending.filter((p) => p.studentId === focusStudentId) : pending;
  const displayedDuplicateRows = focusStudentId ? duplicateRows.filter((p) => p.studentId === focusStudentId) : duplicateRows;
  const displayedNormalRows = focusStudentId ? normalRows.filter((p) => p.studentId === focusStudentId) : normalRows;
  const displayedNormalIds = displayedNormalRows.map((p) => p.id);
  const allDisplayedNormalSelected = displayedNormalIds.length > 0 && displayedNormalIds.every((id) => selected.has(id));
  const focusStudentName = focusedPending[0]?.studentName;

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allDisplayedNormalSelected) displayedNormalIds.forEach((id) => next.delete(id));
      else displayedNormalIds.forEach((id) => next.add(id));
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        {t("intro")}
      </p>

      {focusStudentId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
          {focusStudentName ? t("studentFocus", { name: focusStudentName, count: focusedPending.length }) : t("studentFocusEmpty")}
        </div>
      )}

      {/* 세션 선택 + 분석 실행 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("selectTitle")}</CardTitle>
          <CardDescription>{t("selectDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select className="border rounded-md px-3 py-2 text-sm bg-card w-full"
            value={selectedSessionId} onChange={(e) => setSelectedSessionId(e.target.value)}>
            <option value="all">{t("allPendingOnly")}</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {buildSessionLabel(s.date, s.subject, s.topic)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button
              onClick={runAnalyze}
              disabled={busy || selectedSessionId === "all"}
              className="flex-1">
              {busy ? t("analyzing") : t("runAnalyze")}
            </Button>
            <Button variant="outline" onClick={loadPending}>{t("refresh")}</Button>
          </div>
          {message && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-xl px-3 py-2 text-sm">
              {message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 중복 가능성 */}
      {displayedDuplicateRows.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              {t("duplicateTitle", { count: displayedDuplicateRows.length })}
            </CardTitle>
            <CardDescription className="text-red-600 text-xs">
              {t("duplicateDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {displayedDuplicateRows.map((p) => (
              <PendingRow key={p.id} p={p} selected={selected.has(p.id)}
                onToggle={() => setSelected((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                onDecideOne={(d) => decide(d, [p.id])}
                onOverride={(pts) => decideWithOverride(p.id, pts)}
                override={overrideEdit[p.id]}
                setOverride={(v) => setOverrideEdit((s) => ({ ...s, [p.id]: v }))}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* 일반 보너스 후보 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("recommendedTitle", { count: displayedNormalRows.length })}</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={toggleAll} disabled={displayedNormalRows.length === 0}>
                {allDisplayedNormalSelected ? t("deselectAll") : t("selectAll")}
              </Button>
              <Button size="sm" onClick={() => decide("APPROVE")}
                disabled={selected.size === 0 || busy}>
                {t("approveSelected", { count: selected.size })}
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide("REJECT")}
                disabled={selected.size === 0 || busy}
                className="text-red-500 border-red-200 hover:bg-red-50">
                {t("reject")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {displayedNormalRows.length === 0 ? (
            <EmptyState icon="✅" title={t("noPending")} />
          ) : displayedNormalRows.map((p) => (
            <PendingRow key={p.id} p={p} selected={selected.has(p.id)}
              onToggle={() => setSelected((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
              onDecideOne={(d) => decide(d, [p.id])}
              onOverride={(pts) => decideWithOverride(p.id, pts)}
              override={overrideEdit[p.id]}
              setOverride={(v) => setOverrideEdit((s) => ({ ...s, [p.id]: v }))}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PendingRow({
  p, selected, onToggle, onDecideOne, onOverride, override, setOverride,
}: {
  p: PendingLog; selected: boolean;
  onToggle: () => void;
  onDecideOne: (d: "APPROVE" | "REJECT") => void;
  onOverride: (pts: number) => void;
  override: number | undefined;
  setOverride: (v: number) => void;
}) {
  const t = useTranslations("pointReview");
  const tL = useTranslations("pointLabel");
  const b = bonusLabel(p.bonusType);
  const isDup = p.bonusType.includes("DUPLICATE");
  const content = p.commentContent || p.questionContent;
  const targetLabel = p.relatedQuestionId ? t("targetQuestion") : t("targetAnswer");
  return (
    <div className={`rounded-xl border border-border p-3 space-y-2 ${selected ? "bg-indigo-50 dark:bg-indigo-950/40" : "bg-card"}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 w-4 h-4 accent-indigo-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/teacher-students?studentId=${p.studentId}`}
              className="text-sm font-bold text-foreground underline-offset-2 hover:text-indigo-600 hover:underline"
            >
              {p.studentName}
            </Link>
            <span className="text-xs text-muted-foreground">{t("gradeClass", { grade: p.grade ?? "", className: p.className ?? "" })}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
              style={{ background: b.color }}>
              {b.emoji} {b.labelKey ? tL(b.labelKey) : b.raw}
              {!isDup && <span className="ml-1">{t("pointsSuffix", { points: p.points })}</span>}
            </span>
            {p.relatedQuestionId && p.questionLikeCount != null && (
              <span className="text-xs font-medium text-rose-500">❤️ {p.questionLikeCount}</span>
            )}
            {/* 중복 지급 방지 안내: 같은 작성물/세션에서 이미 승인된 포인트 */}
            {p.alreadyForTarget > 0 && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {t("alreadyForTarget", { target: targetLabel, points: p.alreadyForTarget })}
              </span>
            )}
            {p.alreadyForTarget === 0 && p.alreadyInSession > 0 && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {t("alreadyInSession", { points: p.alreadyInSession })}
              </span>
            )}
          </div>
          <div className="mt-1.5 text-xs">
            <span className="text-muted-foreground">{targetLabel}: </span>
            <span className="text-foreground">{content || t("noContent")}</span>
          </div>
          {p.reason && (
            <div className="mt-1 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
              💬 {p.reason}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-7">
        {!isDup && (
          <>
            <Input
              type="number"
              value={override ?? ""}
              onChange={(e) => setOverride(parseInt(e.target.value) || 0)}
              placeholder={t("overridePlaceholder", { points: p.points })}
              className="h-7 w-24 text-xs"
            />
            <Button size="sm" variant="outline" className="h-7 text-xs"
              disabled={!override}
              onClick={() => onOverride(override!)}>
              {t("overrideApprove")}
            </Button>
          </>
        )}
        <Button size="sm" className="h-7 text-xs" onClick={() => onDecideOne("APPROVE")}>
          {t("approve")}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50"
          onClick={() => onDecideOne("REJECT")}>
          {t("reject")}
        </Button>
      </div>
    </div>
  );
}
