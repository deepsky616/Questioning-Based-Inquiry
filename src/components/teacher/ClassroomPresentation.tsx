"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export interface ClassroomQuestion {
  id: string;
  content: string;
  classification: string;
  explanation?: string;
  authorName?: string;
}

export function ClassroomPresentation({ items, title, label }: { items: ClassroomQuestion[]; title: string; label?: string }) {
  const t = useTranslations("classroomPresentation");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [showNames, setShowNames] = useState(false);
  // 열어 둔 동안 배경 목록이 갱신되어도 발표 중인 질문이나 순서가 바뀌지 않는다.
  const [snapshot, setSnapshot] = useState<ClassroomQuestion[]>([]);
  const question = snapshot[index];
  const move = (next: number) => {
    if (next < 0 || next >= snapshot.length) return;
    setIndex(next);
    setRevealed(false);
  };
  return <>
    <Button type="button" variant="outline" className="h-auto min-h-11 max-w-full gap-2 whitespace-normal py-2 text-left" disabled={!items.length} onClick={() => {
      setSnapshot(items.map(item => ({ ...item })));
      setIndex(0); setRevealed(false); setShowNames(false); setOpen(true);
    }}><Monitor className="h-4 w-4 shrink-0" aria-hidden="true" />{label || t("open")}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="inset-0 left-0 top-0 flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-4 sm:rounded-none sm:p-6" onKeyDown={event => {
        if ((event.target as HTMLElement).closest("button,input,select,textarea,a") || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowRight") { event.preventDefault(); move(index + 1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); move(index - 1); }
      }}>
        <DialogHeader className="shrink-0 pr-7 text-left">
          <DialogTitle className="text-lg sm:text-xl">{t("title")} · {title}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b pb-3">
          <p className="font-semibold tabular-nums" aria-live="polite">{t("count", { current: index + 1, total: snapshot.length })}</p>
          {snapshot.some(item => item.authorName) && <Button variant="outline" aria-pressed={showNames} onClick={() => setShowNames(value => !value)}>{t("names")}</Button>}
        </div>
        {question && <section key={question.id} aria-label={t("question")} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-1 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6 sm:py-8">
          {showNames && question.authorName && <p className="mb-4 text-lg text-muted-foreground">{question.authorName}</p>}
          <p className="mx-auto max-w-6xl whitespace-pre-wrap break-keep text-2xl font-bold leading-relaxed [overflow-wrap:anywhere] sm:text-4xl sm:leading-relaxed lg:text-5xl lg:leading-relaxed">{question.content}</p>
          {revealed && <div className="mx-auto mt-6 max-w-6xl space-y-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/40" aria-live="polite">
            <h3 className="text-xl font-bold text-emerald-900 dark:text-emerald-100 sm:text-2xl">{question.classification}</h3>
            {question.explanation && <p className="whitespace-pre-wrap break-words text-lg leading-relaxed sm:text-2xl sm:leading-relaxed">{question.explanation}</p>}
          </div>}
        </section>}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex gap-2">
            <Button variant="outline" disabled={index === 0} onClick={() => move(index - 1)} aria-label={t("previous")}><ChevronLeft aria-hidden="true" /><span className="hidden sm:inline">{t("previous")}</span></Button>
            <Button variant="outline" disabled={index >= snapshot.length - 1} onClick={() => move(index + 1)} aria-label={t("next")}><span className="hidden sm:inline">{t("next")}</span><ChevronRight aria-hidden="true" /></Button>
          </div>
          <Button className="h-auto min-h-11 whitespace-normal py-2" aria-expanded={revealed} onClick={() => setRevealed(value => !value)}>{t(revealed ? "hide" : "reveal")}</Button>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("close")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
