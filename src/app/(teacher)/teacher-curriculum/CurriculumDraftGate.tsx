"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth-helpers";
import { formatDateTime } from "@/lib/datetime";
import { clearCurriculumDraft, readCurriculumDraft, writeCurriculumDraft, type CurriculumDraft, type SavedCurriculumDraft } from "@/lib/curriculum-draft";

interface WorkspaceProps { initialDraft?: CurriculumDraft; onDraftChange: (value: CurriculumDraft) => void; onDraftComplete: () => void }
export function CurriculumDraftGate({ children }: { children: (props: WorkspaceProps) => ReactNode }) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  return user.id ? <AccountDraft key={user.id} teacherId={user.id}>{children}</AccountDraft> : null;
}
function AccountDraft({ teacherId, children }: { teacherId: string; children: (props: WorkspaceProps) => ReactNode }) {
  const t = useTranslations("curriculumDraft");
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<SavedCurriculumDraft | null>(null);
  const [initialDraft, setInitialDraft] = useState<CurriculumDraft>();
  const [status, setStatus] = useState<"empty" | "saved" | "error">("empty");
  useEffect(() => {
    try { setPending(readCurriculumDraft(window.localStorage, teacherId)); }
    catch { setStatus("error"); }
    setReady(true);
  }, [teacherId]);
  const onDraftChange = useCallback((value: CurriculumDraft) => {
    if (!value.selGrade) return;
    try { writeCurriculumDraft(window.localStorage, teacherId, value); setStatus("saved"); }
    catch { setStatus("error"); }
  }, [teacherId]);
  const onDraftComplete = useCallback(() => {
    try { clearCurriculumDraft(window.localStorage, teacherId); setStatus("empty"); }
    catch { setStatus("error"); }
  }, [teacherId]);
  if (!ready) return <p role="status" className="py-8 text-center text-muted-foreground">{t("loading")}</p>;
  if (pending) return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-bold">{t("foundTitle")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("foundDescription", { time: formatDateTime(new Date(pending.updatedAt)), step: pending.value.step })}</p>
      <p className="mt-3 font-medium">{pending.value.saveTitle || pending.value.selSubject}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={() => { setInitialDraft(pending.value); setPending(null); }}>{t("restore")}</Button>
        <Button variant="outline" onClick={() => { onDraftComplete(); setPending(null); }}>{t("startNew")}</Button>
      </div>
    </section>
  );
  return <>
    {status !== "empty" && <p role={status === "error" ? "alert" : "status"} className={`mb-4 rounded-lg border p-3 text-sm ${status === "error" ? "border-destructive/30 text-destructive" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"}`}>{t(status)}</p>}
    {children({ initialDraft, onDraftChange, onDraftComplete })}
  </>;
}
