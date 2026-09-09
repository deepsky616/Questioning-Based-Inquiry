"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { getSessionUser } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QuestionGrowthContent } from "./QuestionGrowthContent";
import type { GrowthResponse } from "./question-growth-types";
import { clearMatchingGrowthDraft, readGrowthDraft, writeGrowthDraft, type GrowthDraft, type GrowthEditableField } from "@/lib/question-growth-draft";

type EditableField = GrowthEditableField;
type Draft = GrowthDraft;
type Message = "saved" | "saveFailed" | "conflict" | "savedRefreshFailed" | null;
export interface GrowthProtection { dirty: boolean; protected: boolean; saving: boolean }
interface EditorProps { questionId: string; quick?: boolean; onProtectionChange?: (state: GrowthProtection) => void }

export function QuestionGrowthEditor({ questionId, quick = false, onProtectionChange }: EditorProps) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  return <AccountGrowthEditor key={`${user.id}:${questionId}:${quick}`} userId={user.id} questionId={questionId} quick={quick} onProtectionChange={onProtectionChange} />;
}

function AccountGrowthEditor({ userId, questionId, quick, onProtectionChange }: EditorProps & { userId: string; quick: boolean }) {
  const t = useTranslations("growth");
  const tc = useTranslations("common");
  const client = useQueryClient();
  const inputId = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState<Message>(null);
  const restored = useRef(false);
  const [draftStatus, setDraftStatus] = useState<"empty" | "saved" | "restored" | "error">("empty");
  const query = useQuery<GrowthResponse>({
    queryKey: ["question-growth", userId, "question", questionId],
    enabled: Boolean(userId && questionId),
    queryFn: async () => {
      const response = await fetch(`/api/question-growth?questionId=${encodeURIComponent(questionId)}`);
      if (!response.ok) throw new Error("성장 기록 조회 실패");
      return response.json();
    },
    retry: 1,
  });
  const record = query.data?.records.find(item => item.questionId === questionId);
  const question = query.data?.questions.find(item => item.id === questionId);
  const content = useMemo(() => record ?? { originalContent: question?.content ?? "", revisedContent: question?.content ?? "", changeNote: "", reflection: "" }, [record, question?.content]);
  const value = (field: EditableField) => draft?.changes[field] ?? content[field] ?? "";
  const blocked = message === "conflict" || message === "savedRefreshFailed";
  const persistDraft = (next: Draft) => {
    try { writeGrowthDraft(window.localStorage, userId, questionId, next); setDraftStatus("saved"); }
    catch { setDraftStatus("error"); }
  };
  const clearSubmitted = (submitted: Draft) => {
    try { clearMatchingGrowthDraft(window.localStorage, userId, questionId, submitted); } catch { /* 서버에 저장된 내용은 재조회로 확인한다. */ }
  };

  useEffect(() => {
    if (restored.current || !question || !query.data?.canEdit) return;
    restored.current = true;
    try {
      const saved = readGrowthDraft(window.localStorage, userId, questionId);
      if (!saved) return;
      // 저장 후 응답이 끊겼어도 서버에서 같은 내용이 확인되면 다시 제출하지 않는다.
      if (Object.entries(saved.changes).every(([field, text]) => (content[field as EditableField] ?? "") === text)) {
        clearMatchingGrowthDraft(window.localStorage, userId, questionId, saved);
        return;
      }
      setDraft(saved);
      setDraftStatus("restored");
      if (saved.revision !== (record?.revision ?? 0)) setMessage("conflict");
    } catch { setDraftStatus("error"); }
  }, [userId, questionId, question, query.data?.canEdit, content, record?.revision]);

  useEffect(() => {
    onProtectionChange?.({ dirty: Boolean(draft), protected: draftStatus === "saved" || draftStatus === "restored", saving });
    if (!draft || (draftStatus !== "error" && !saving)) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [draft, draftStatus, saving, onProtectionChange]);

  const change = (field: EditableField, text: string) => {
    const next = { revision: draft?.revision ?? record?.revision ?? 0, changes: { ...draft?.changes, [field]: text } };
    setDraft(next);
    persistDraft(next);
    if (!blocked) setMessage(null);
  };

  const refreshRecord = async () => {
    const refreshed = await query.refetch();
    if (refreshed.isError) return;
    const revision = refreshed.data?.records.find(item => item.questionId === questionId)?.revision ?? 0;
    // 명시적으로 다시 불러온 경우에만 버전을 갱신하고 작성 중인 필드는 유지한다.
    if (message === "savedRefreshFailed") {
      if (draft) clearSubmitted(draft);
      setDraft(null);
      setDraftStatus("empty");
    } else if (draft) {
      const next = { ...draft, revision };
      setDraft(next);
      persistDraft(next);
    }
    setMessage(message === "savedRefreshFailed" ? "saved" : null);
  };

  const save = async () => {
    if (savingRef.current || blocked || !draft || !question || !query.data?.canEdit) return;
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/question-growth", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, revision: draft.revision, ...draft.changes }),
      });
      if (!response.ok) { setMessage(response.status === 409 ? "conflict" : "saveFailed"); return; }
      void client.invalidateQueries({ queryKey: ["my-questions", userId] });
      void client.invalidateQueries({ queryKey: ["my-questions-all-sessions", userId] });
      const refreshed = await query.refetch();
      if (refreshed.isError) { setMessage("savedRefreshFailed"); return; }
      clearSubmitted(draft);
      setDraft(null);
      setDraftStatus("empty");
      setMessage("saved");
      void client.invalidateQueries({ queryKey: ["question-growth"] });
    } catch { setMessage("saveFailed"); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return <div className="space-y-4">
    {query.isLoading && <p role="status" className="text-sm">{t("loading")}</p>}
    {query.isError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{t("loadFailed")}</p><Button variant="outline" onClick={() => query.refetch()}>{tc("retry")}</Button></div>}
    {question && <>
      {query.data?.canEdit ? <>
        {draftStatus !== "empty" && message !== "saved" && <p role={draftStatus === "error" ? "alert" : "status"} className={`rounded-lg border p-3 text-sm leading-relaxed ${draftStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>{t(`draft_${draftStatus}`)}</p>}
        {!quick && <QuestionGrowthContent record={content} questionOnly formLayout />}
        <div className={`grid gap-4 ${quick ? "" : "sm:grid-cols-2"}`}>
          <div className="flex min-w-0 flex-col rounded-xl border bg-background p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><label htmlFor={`${inputId}-changeNote`} className="text-base font-semibold">{t("changeNote")}</label><span className="text-xs text-muted-foreground">{t("optional")}</span></div>
            <p id={`${inputId}-changeNote-help`} className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("changeNoteHelp")}</p>
            <Textarea id={`${inputId}-changeNote`} aria-describedby={`${inputId}-changeNote-help ${inputId}-changeNote-count`} className="mt-3 min-h-32 flex-1 text-base leading-relaxed" disabled={saving || message === "savedRefreshFailed"} value={value("changeNote")} maxLength={300} onChange={event => change("changeNote", event.target.value)} placeholder={t("changeNoteHint")} />
            <span id={`${inputId}-changeNote-count`} className="mt-1 block text-right text-xs text-muted-foreground">{value("changeNote").length}/300</span>
          </div>
          {(!quick || draft?.changes.reflection !== undefined) && <div className="flex min-w-0 flex-col rounded-xl border bg-background p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><label htmlFor={`${inputId}-reflection`} className="text-base font-semibold">{t("reflection")}</label><span className="text-xs text-muted-foreground">{t("optional")}</span></div>
            <p id={`${inputId}-reflection-help`} className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("reflectionLater")}</p>
            <Textarea id={`${inputId}-reflection`} aria-describedby={`${inputId}-reflection-help ${inputId}-reflection-count`} className="mt-3 min-h-32 flex-1 text-base leading-relaxed" disabled={saving || message === "savedRefreshFailed"} value={value("reflection")} maxLength={600} onChange={event => change("reflection", event.target.value)} placeholder={t("reflectionHint")} />
            <span id={`${inputId}-reflection-count`} className="mt-1 block text-right text-xs text-muted-foreground">{value("reflection").length}/600</span>
          </div>}
        </div>
        <Button type="button" disabled={saving || blocked || !draft || (!record && !value("changeNote").trim() && !value("reflection").trim())} onClick={save}>{saving ? t("saving") : t("save")}</Button>
      </> : <QuestionGrowthContent record={content} />}
    </>}
    {message && <div role={message === "saved" ? "status" : "alert"} className={`space-y-2 text-sm leading-relaxed ${message === "saved" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>
      <p>{t(message)}</p>
      {blocked && <Button variant="outline" onClick={refreshRecord}>{tc("retry")}</Button>}
    </div>}
  </div>;
}
