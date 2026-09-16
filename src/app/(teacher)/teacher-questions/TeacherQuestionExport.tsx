"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

export function TeacherQuestionExport({ queryPath, questionIds, totalCount, disabled }: {
  queryPath: string;
  questionIds: string[];
  totalCount: number;
  disabled: boolean;
}) {
  const t = useTranslations("teacherQ.excel");
  const locale = useLocale();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"filtered" | "selected">("filtered");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function download() {
    if (requestRef.current || disabled || (scope === "selected" && !questionIds.length)) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(queryPath.split("?")[1]);
      for (const key of ["view", "page", "pageSize"]) params.delete(key);
      const response = await fetch(`/api/questions/export?${params}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ scope, locale: locale === "en" ? "en" : "ko", ...(scope === "selected" ? { questionIds } : {}) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const key = body.code === "EXPORT_TOO_LARGE" ? "tooLarge"
          : body.code === "EXPORT_SELECTION_CHANGED" ? "selectionChanged"
            : body.code === "EXPORT_EMPTY" ? "empty"
              : response.status === 401 ? "unauthorized" : response.status === 403 ? "forbidden"
                : response.status === 429 ? "rateLimited" : "error";
        setError(t(key));
        return;
      }
      if (!response.headers.get("Content-Type")?.includes("spreadsheetml.sheet")) throw new Error(t("error"));
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const encodedName = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const filename = encodedName ? decodeURIComponent(encodedName) : "student_questions.xlsx";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const count = Number(response.headers.get("X-Question-Count")) || (scope === "selected" ? questionIds.length : totalCount);
      toast({ title: t("success", { count }) });
      setOpen(false);
    } catch {
      if (!controller.signal.aborted) setError(t("error"));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      requestRef.current = null;
    }
  }

  return <>
    <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 gap-2 whitespace-nowrap py-2" disabled={disabled || totalCount === 0} onClick={() => {
      setScope(questionIds.length ? "selected" : "filtered");
      setError("");
      setOpen(true);
    }}><Download className="h-4 w-4 shrink-0" aria-hidden="true" />{t("open")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent showCloseButton={!busy} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="space-y-3">
          <legend className="sr-only">{t("description")}</legend>
          {(["filtered", "selected"] as const).map(value => {
            const unavailable = value === "selected" && questionIds.length === 0;
            const label = t(value === "selected" ? "selectedCount" : "filteredCount", { count: value === "selected" ? questionIds.length : totalCount });
            return <label key={value} className={`flex items-start gap-3 rounded-lg border p-3 ${scope === value ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30" : "border-border"} ${unavailable ? "opacity-50" : "cursor-pointer"}`}>
              <input type="radio" name="question-export-scope" value={value} aria-label={label} checked={scope === value} disabled={unavailable} onChange={() => setScope(value)} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" />
              <span className="min-w-0 space-y-1">
                <span className="block text-sm font-semibold tabular-nums">{label}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">{t(value === "selected" ? "selectedHelp" : "filteredHelp")}</span>
              </span>
            </label>;
          })}
        </fieldset>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("contents")}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button type="button" disabled={busy || disabled || (scope === "selected" && !questionIds.length)} onClick={() => void download()} className="gap-2" aria-busy={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            {t(busy ? "preparing" : "download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
