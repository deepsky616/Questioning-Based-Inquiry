"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Sprout } from "lucide-react";
import { getSessionUser } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateOnly } from "@/lib/datetime";

interface GrowthRecord { questionId: string; originalContent: string; revisedContent: string; reflection: string; revision: number; updatedAt: string }
interface GrowthQuestion { id: string; content: string; session: { date: string; subject: string; topic: string } | null }
interface GrowthResponse { questions: GrowthQuestion[]; records: GrowthRecord[]; canEdit: boolean }
type Draft = Pick<GrowthRecord, "revisedContent" | "reflection" | "revision">;

export function QuestionGrowthJournal({ studentId }: { studentId?: string }) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  return <AccountGrowthJournal key={`${user.id}:${studentId ?? user.id}`} userId={user.id} studentId={studentId} />;
}
function AccountGrowthJournal({ userId, studentId }: { userId?: string; studentId?: string }) {
  const t = useTranslations("growth");
  const tc = useTranslations("common");
  const targetId = studentId || userId;
  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saved" | "saveFailed" | "conflict" | "savedRefreshFailed" | null>(null);
  const query = useQuery<GrowthResponse>({
    queryKey: ["question-growth", userId, targetId],
    enabled: Boolean(userId && targetId),
    queryFn: async () => {
      const response = await fetch(`/api/question-growth?studentId=${encodeURIComponent(targetId ?? "")}`);
      if (!response.ok) throw new Error("성장 기록 조회 실패");
      return response.json();
    },
    retry: 1,
  });
  const records = query.data?.records ?? [];
  const questions = query.data?.questions ?? [];
  const selectedRecord = records.find((record) => record.questionId === selectedId);
  const selectedQuestion = questions.find((question) => question.id === selectedId);
  const draft = drafts[selectedId] ?? selectedRecord ?? { revisedContent: "", reflection: "", revision: 0 };
  const change = (key: keyof Draft, value: string) => {
    setMessage(null);
    setDrafts((previous) => ({ ...previous, [selectedId]: { revisedContent: draft.revisedContent, reflection: draft.reflection, revision: draft.revision, [key]: value } }));
  };
  const refreshRecord = async () => {
    const refreshed = await query.refetch();
    if (refreshed.isError) return;
    const revision = refreshed.data?.records.find(record => record.questionId === selectedId)?.revision ?? 0;
    setDrafts(previous => previous[selectedId] ? { ...previous, [selectedId]: { ...previous[selectedId], revision } } : previous);
    setMessage(null);
  };
  const save = async () => {
    if (saving || !selectedId || !query.data?.canEdit) return;
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/question-growth", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: selectedId, revisedContent: draft.revisedContent, reflection: draft.reflection, revision: draft.revision }),
      });
      if (!response.ok) { setMessage(response.status === 409 ? "conflict" : "saveFailed"); return; }
      const refreshed = await query.refetch();
      if (refreshed.isError) { setMessage("savedRefreshFailed"); return; }
      setDrafts((previous) => { const next = { ...previous }; delete next[selectedId]; return next; });
      setMessage("saved");
    } catch { setMessage("saveFailed"); }
    finally { setSaving(false); }
  };

  return (
    <section className="rounded-2xl border border-emerald-200 bg-card p-4 shadow-sm dark:border-emerald-900 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Sprout className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{t("title")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(studentId ? "teacherDescription" : "description")}</p>
      {query.isLoading && <p role="status" className="mt-4 text-sm">{t("loading")}</p>}
      {query.isError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-destructive"><span>{t("loadFailed")}</span><Button variant="outline" onClick={() => query.refetch()}>{tc("retry")}</Button></div>}
      {query.data?.canEdit && (
        <div className="no-print mt-4 space-y-4">
          <label className="block text-sm font-semibold">{t("choose")}
            <select className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" value={selectedId} disabled={saving} onChange={(event) => { setSelectedId(event.target.value); setMessage(null); }}>
              <option value="">{t("choosePlaceholder")}</option>
              {questions.map((question) => <option key={question.id} value={question.id}>{question.session ? `${question.session.subject} · ` : ""}{question.content}</option>)}
              {records.filter((record) => !questions.some((question) => question.id === record.questionId)).map((record) => <option key={record.questionId} value={record.questionId}>{record.originalContent}</option>)}
            </select>
          </label>
          {selectedId && <>
            <div className="rounded-xl bg-muted/50 p-4"><p className="text-sm font-semibold">{t("original")}</p><p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{selectedRecord?.originalContent ?? selectedQuestion?.content}</p></div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold">{t("revised")}<Textarea className="mt-2 min-h-32 text-base leading-relaxed" value={draft.revisedContent} disabled={saving} maxLength={300} onChange={(event) => change("revisedContent", event.target.value)} placeholder={t("revisedHint")} /><span className="mt-1 block text-right text-xs font-normal text-muted-foreground">{draft.revisedContent.length}/300</span></label>
              <label className="text-sm font-semibold">{t("reflection")}<Textarea className="mt-2 min-h-32 text-base leading-relaxed" value={draft.reflection} disabled={saving} maxLength={600} onChange={(event) => change("reflection", event.target.value)} placeholder={t("reflectionHint")} /><span className="mt-1 block text-right text-xs font-normal text-muted-foreground">{draft.reflection.length}/600</span></label>
            </div>
            <Button onClick={save} disabled={saving || message === "conflict" || message === "savedRefreshFailed" || draft.revisedContent.trim().length < 5 || draft.reflection.trim().length < 5}>{saving ? t("saving") : t("save")}</Button>
          </>}
          {message && <p role={message === "saved" ? "status" : "alert"} className={`text-sm ${message === "saved" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>{t(message)}{(message === "conflict" || message === "savedRefreshFailed") && <Button className="ml-2" variant="outline" onClick={refreshRecord}>{tc("retry")}</Button>}</p>}
        </div>
      )}
      {query.data && records.length === 0 && <p className="mt-4 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{t(studentId ? "teacherEmpty" : "empty")}</p>}
      <div className="mt-5 space-y-4">
        {records.map((record) => <article key={record.questionId} className="rounded-xl border p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{formatDateOnly(record.updatedAt)}</p>{query.data?.canEdit && <Button disabled={saving} variant="outline" size="sm" onClick={() => { setSelectedId(record.questionId); setMessage(null); }}>{t("continue")}</Button>}</div>
          <dl className="grid gap-4 md:grid-cols-3">{(["originalContent", "revisedContent", "reflection"] as const).map((key, index) => <div key={key}><dt className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{t(["original", "revised", "reflection"][index])}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{record[key]}</dd></div>)}</dl>
        </article>)}
      </div>
    </section>
  );
}
