"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ACTIVITY_BONUS_TYPES } from "@/lib/activity-bonus-policy";
import { buildSessionLabel } from "@/lib/sessions";

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
}

function bonusLabel(bt: string): { label: string; emoji: string; color: string } {
  const stripped = bt.replace(/^AI_/, "");
  if (stripped in ACTIVITY_BONUS_TYPES) {
    const def = ACTIVITY_BONUS_TYPES[stripped as keyof typeof ACTIVITY_BONUS_TYPES];
    return {
      label: def.label,
      emoji: def.emoji,
      color: stripped === "DUPLICATE_FLAGGED" ? "#ef4444" : "#6366f1",
    };
  }
  return { label: bt, emoji: "🎯", color: "#6366f1" };
}

export function PointReviewView() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("all");
  const [pending, setPending] = useState<PendingLog[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [overrideEdit, setOverrideEdit] = useState<Record<string, number>>({});

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

  async function runAnalyze() {
    if (selectedSessionId === "all") {
      setMessage("분석할 세션을 선택해주세요");
      return;
    }
    setBusy(true); setMessage(null);
    try {
      const res = await fetch("/api/teacher/points/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSessionId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`🤖 AI 분석 완료: ${data.createdPending}개 후보 생성 (질문 ${data.questionCount} · 답변 ${data.commentCount})`);
        loadPending();
      } else {
        setMessage(data.error || "분석 실패");
      }
    } catch { setMessage("네트워크 오류"); }
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
      setMessage(`${targetIds.length}건 ${decision === "APPROVE" ? "승인" : "거부"}됨`);
      loadPending();
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
      setMessage(`점수 ${points}점으로 수정 후 승인`);
      loadPending();
    } catch {} finally { setBusy(false); }
  }

  function toggleAll() {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map((p) => p.id)));
  }

  const duplicateRows = pending.filter((p) => p.bonusType.includes("DUPLICATE"));
  const normalRows = pending.filter((p) => !p.bonusType.includes("DUPLICATE"));

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        학생의 질문·답변을 AI가 채점한 후보를 확인하고 승인하세요. 최종 결정은 선생님께 있어요.
      </p>

      {/* 세션 선택 + 분석 실행 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">분석할 수업세션 선택</CardTitle>
          <CardDescription>세션을 고르고 [AI 채점] 버튼을 누르면 학생 활동을 분석합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select className="border rounded-md px-3 py-2 text-sm bg-card w-full"
            value={selectedSessionId} onChange={(e) => setSelectedSessionId(e.target.value)}>
            <option value="all">전체 (대기 중인 후보만 표시)</option>
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
              {busy ? "AI 분석 중..." : "🤖 AI 채점 실행"}
            </Button>
            <Button variant="outline" onClick={loadPending}>새로고침</Button>
          </div>
          {message && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-xl px-3 py-2 text-sm">
              {message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 중복 가능성 */}
      {duplicateRows.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              ⚠️ 중복 가능성 ({duplicateRows.length})
            </CardTitle>
            <CardDescription className="text-red-600 text-xs">
              학생이 다른 작성물과 거의 동일한 내용을 작성했어요. 베끼기 또는 중복일 가능성을 검토하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {duplicateRows.map((p) => (
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
            <CardTitle className="text-base">추천 보너스 · 총 {normalRows.length}개</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={toggleAll} disabled={normalRows.length === 0}>
                {selected.size === pending.length ? "선택 해제" : "전체 선택"}
              </Button>
              <Button size="sm" onClick={() => decide("APPROVE")}
                disabled={selected.size === 0 || busy}>
                ✅ 선택 승인 ({selected.size})
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide("REJECT")}
                disabled={selected.size === 0 || busy}
                className="text-red-500 border-red-200 hover:bg-red-50">
                거부
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {normalRows.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">대기 중인 보너스가 없어요</p>
          ) : normalRows.map((p) => (
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
  const b = bonusLabel(p.bonusType);
  const isDup = p.bonusType.includes("DUPLICATE");
  const content = p.commentContent || p.questionContent;
  const targetLabel = p.relatedQuestionId ? "질문" : "답변";
  return (
    <div className={`rounded-xl border border-border p-3 space-y-2 ${selected ? "bg-indigo-50 dark:bg-indigo-950/40" : "bg-card"}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 w-4 h-4 accent-indigo-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-foreground text-sm">{p.studentName}</span>
            <span className="text-xs text-muted-foreground">{p.grade}학년 {p.className}반</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
              style={{ background: b.color }}>
              {b.emoji} {b.label}
              {!isDup && <span className="ml-1">+{p.points}점</span>}
            </span>
            {p.relatedQuestionId && p.questionLikeCount != null && (
              <span className="text-xs font-medium text-rose-500">❤️ {p.questionLikeCount}</span>
            )}
          </div>
          <div className="mt-1.5 text-xs">
            <span className="text-muted-foreground">{targetLabel}: </span>
            <span className="text-foreground">{content || "(내용 없음)"}</span>
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
              placeholder={`수정: ${p.points}`}
              className="h-7 w-24 text-xs"
            />
            <Button size="sm" variant="outline" className="h-7 text-xs"
              disabled={!override}
              onClick={() => onOverride(override!)}>
              수정 후 승인
            </Button>
          </>
        )}
        <Button size="sm" className="h-7 text-xs" onClick={() => onDecideOne("APPROVE")}>
          승인
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50"
          onClick={() => onDecideOne("REJECT")}>
          거부
        </Button>
      </div>
    </div>
  );
}
