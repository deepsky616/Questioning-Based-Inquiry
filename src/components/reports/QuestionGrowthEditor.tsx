"use client";

import { useId, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { getSessionUser } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QuestionGrowthContent } from "./QuestionGrowthContent";
import type { GrowthResponse } from "./question-growth-types";

type EditableField = "changeNote" | "reflection";
type Draft = { revision: number; changes: Partial<Record<EditableField, string>> };
type Message = "saved" | "saveFailed" | "conflict" | "savedRefreshFailed" | null;

export function QuestionGrowthEditor({ questionId, quick = false }: { questionId: string; quick?: boolean }) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  return <AccountGrowthEditor key={`${user.id}:${questionId}:${quick}`} userId={user.id} questionId={questionId} quick={quick} />;
}

function AccountGrowthEditor({ userId, questionId, quick }: { userId: string; questionId: string; quick: boolean }) {
  const t = useTranslations("growth");
  const tc = useTranslations("common");
  const client = useQueryClient();
  const inputId = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState<Message>(null);
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
  const content = record ?? { originalContent: question?.content ?? "", revisedContent: question?.content ?? "", changeNote: "", reflection: "" };
  const value = (field: EditableField) => draft?.changes[field] ?? content[field] ?? "";
  const blocked = message === "conflict" || message === "savedRefreshFailed";

  const change = (field: EditableField, text: string) => {
    setDraft(previous => ({ revision: previous?.revision ?? record?.revision ?? 0, changes: { ...previous?.changes, [field]: text } }));
    if (!blocked) setMessage(null);
  };

  const refreshRecord = async () => {
    const refreshed = await query.refetch();
    if (refreshed.isError) return;
    const revision = refreshed.data?.records.find(item => item.questionId === questionId)?.revision ?? 0;
    // 명시적으로 다시 불러온 경우에만 버전을 갱신하고 작성 중인 필드는 유지한다.
    setDraft(previous => message === "savedRefreshFailed" ? null : previous ? { ...previous, revision } : null);
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
      setDraft(null);
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
        {!quick && <QuestionGrowthContent record={content} questionOnly formLayout />}
        <div className={`grid gap-4 ${quick ? "" : "sm:grid-cols-2"}`}>
          <div className="flex min-w-0 flex-col rounded-xl border bg-background p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><label htmlFor={`${inputId}-changeNote`} className="text-base font-semibold">{t("changeNote")}</label><span className="text-xs text-muted-foreground">{t("optional")}</span></div>
            <p id={`${inputId}-changeNote-help`} className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("changeNoteHelp")}</p>
            <Textarea id={`${inputId}-changeNote`} aria-describedby={`${inputId}-changeNote-help ${inputId}-changeNote-count`} className="mt-3 min-h-32 flex-1 text-base leading-relaxed" disabled={saving || message === "savedRefreshFailed"} value={value("changeNote")} maxLength={300} onChange={event => change("changeNote", event.target.value)} placeholder={t("changeNoteHint")} />
            <span id={`${inputId}-changeNote-count`} className="mt-1 block text-right text-xs text-muted-foreground">{value("changeNote").length}/300</span>
          </div>
          {!quick && <div className="flex min-w-0 flex-col rounded-xl border bg-background p-4">
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
