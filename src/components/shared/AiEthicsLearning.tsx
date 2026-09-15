"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { ArrowLeft, ArrowRight, Check, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { aiEthicsContentForLocale } from "@/lib/ai-ethics-content";
import { cn } from "@/lib/utils";

export function AiEthicsPromises() {
  const content = aiEthicsContentForLocale(useLocale());
  return <ol className="divide-y rounded-xl border bg-background px-4 sm:px-6">
    {content.promises.map((promise, index) => <li key={promise.title} className="flex gap-3 py-5 sm:gap-4">
      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{index + 1}</span>
      <div className="min-w-0 space-y-2">
        <h3 className="font-bold leading-relaxed">{promise.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{promise.action}</p>
        <details className="text-sm">
          <summary className="w-fit cursor-pointer py-2 font-medium underline decoration-emerald-400 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{content.exampleLabel}</summary>
          <p className="border-l-2 border-emerald-400 py-1 pl-3 leading-relaxed text-muted-foreground">{promise.example}</p>
        </details>
      </div>
    </li>)}
  </ol>;
}

function AiEthicsPresentation() {
  const content = aiEthicsContentForLocale(useLocale());
  const [slide, setSlide] = useState(0);
  const promise = content.promises[slide];
  return <Dialog onOpenChange={(open) => { if (open) setSlide(0); }}>
    <DialogTrigger asChild><Button variant="outline" className="h-auto min-h-11 gap-2 whitespace-normal py-2"><Monitor className="h-4 w-4 shrink-0" aria-hidden="true" />{content.present}</Button></DialogTrigger>
    <DialogContent showCloseButton={false} className="flex h-[92dvh] w-[calc(100%-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-xl p-0">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-8">
        <DialogTitle className="text-sm leading-relaxed">{content.presentationTitle}</DialogTitle>
        <DialogClose asChild><Button variant="outline" className="min-h-11 shrink-0">{content.close}</Button></DialogClose>
      </div>
      <DialogDescription className="sr-only">{content.intro}</DialogDescription>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-12 sm:py-10" aria-live="polite" aria-atomic="true">
        <p className="mb-5 text-lg font-bold text-emerald-700 dark:text-emerald-300">{slide + 1} / {content.promises.length}</p>
        <h3 className="max-w-4xl break-keep text-2xl font-bold leading-snug sm:text-4xl lg:text-5xl">{promise.title}</h3>
        <p className="mt-6 max-w-4xl text-lg leading-relaxed sm:text-2xl">{promise.action}</p>
        <p className="mt-5 max-w-4xl text-base leading-relaxed text-muted-foreground sm:text-xl">{promise.example}</p>
        <div className="mt-8 border-l-4 border-emerald-500 bg-muted/40 p-5">
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{content.discussLabel}</p>
          <p className="mt-2 text-lg font-semibold leading-relaxed sm:text-2xl">{promise.discuss}</p>
        </div>
      </div>
      <div className="flex shrink-0 justify-between gap-3 border-t bg-background p-4 sm:px-8">
        <Button variant="outline" className="min-h-11 gap-2" disabled={slide === 0} onClick={() => setSlide(slide - 1)}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{content.previousPromise}</Button>
        <Button className="min-h-11 gap-2" disabled={slide === content.promises.length - 1} onClick={() => setSlide(slide + 1)}>{content.nextPromise}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
    </DialogContent>
  </Dialog>;
}

export function AiEthicsTeachingGuide() {
  const content = aiEthicsContentForLocale(useLocale());
  return <section className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
    <h3 className="text-xl font-bold">{content.lessonTitle}</h3>
    <p className="text-sm leading-relaxed text-muted-foreground">{content.lessonIntro}</p>
    <ol className="space-y-4">
      {content.lesson.map(step => <li key={step.title} className="flex gap-3">
        <span className="w-14 shrink-0 rounded-md bg-background py-1 text-center text-sm font-bold self-start">{step.time}</span>
        <div><h4 className="font-semibold">{step.title}</h4><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.action}</p></div>
      </li>)}
    </ol>
    <p className="border-t pt-4 text-sm font-medium leading-relaxed">{content.lessonCheck}</p>
    <p className="text-sm leading-relaxed text-muted-foreground">{content.lessonNote}</p>
  </section>;
}

export function AiEthicsLearning({ audience }: { audience: "student" | "teacher" }) {
  const content = aiEthicsContentForLocale(useLocale());
  const [stage, setStage] = useState<"overview" | "situations" | "commitment" | "done">("overview");
  const [situationIndex, setSituationIndex] = useState(0);
  const [selection, setSelection] = useState<number | null>(null);
  const [commitment, setCommitment] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const situation = content.situations[situationIndex];
  const answer = selection === null ? null : situation.options[selection];
  const step = stage === "overview" ? 0 : stage === "situations" ? 1 : 2;
  const focusHeading = () => requestAnimationFrame(() => headingRef.current?.focus());
  function startPractice() {
    setSituationIndex(0); setSelection(null); setCommitment(null); setStage("situations"); focusHeading();
  }
  function advance() {
    setSelection(null);
    if (situationIndex < content.situations.length - 1) setSituationIndex(situationIndex + 1);
    else setStage("commitment");
    focusHeading();
  }
  const title = stage === "overview" ? content.title : stage === "situations" ? situation.title : stage === "commitment" ? content.choiceTitle : content.doneTitle;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ol className="flex flex-wrap gap-x-4 gap-y-2 text-xs sm:text-sm">
        {content.steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={cn("flex items-center gap-2", step === index ? "font-bold text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}><span aria-hidden="true">{index + 1}.</span>{label}</li>)}
      </ol>
      {audience === "teacher" && <AiEthicsPresentation />}
    </div>
    <div className="rounded-xl border bg-muted/20 p-5 sm:p-7">
      {stage === "situations" && <p className="mb-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{content.practice} · {situationIndex + 1} / {content.situations.length}</p>}
      <h2 ref={headingRef} tabIndex={-1} className="break-keep text-2xl font-bold leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-3xl">{title}</h2>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">{stage === "overview" ? content.intro : stage === "situations" ? situation.story : stage === "commitment" ? content.choiceHelp : content.doneHelp}</p>
    </div>
    {stage === "overview" && <>
      <AiEthicsPromises />
      <Button className="min-h-11 gap-2" onClick={startPractice}>{content.practice}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
    </>}
    {stage === "situations" && <>
      <fieldset className="space-y-3" aria-describedby={answer ? `${id}-reason` : undefined}>
        <legend className="mb-3 font-bold">{content.choiceLabel}</legend>
        {situation.options.map((option, index) => <label key={`${situationIndex}-${index}`} className={cn("flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-4 focus-within:ring-2 focus-within:ring-ring", selection === index ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "bg-background hover:bg-muted/40")}>
          <input type="radio" name={`${id}-situation`} checked={selection === index} onChange={() => setSelection(index)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-700" />
          <span className="leading-relaxed">{option.label}</span>
        </label>)}
      </fieldset>
      {answer && <div id={`${id}-reason`} role="status" className="rounded-xl border-l-4 border-emerald-500 bg-muted/40 p-4">
        <p className="font-bold">{answer.recommended ? content.reason : content.reconsider}</p>
        <p className="mt-2 leading-relaxed">{answer.feedback}</p>
      </div>}
      <Button className="min-h-11" disabled={!answer?.recommended} onClick={advance}>{situationIndex === content.situations.length - 1 ? content.choose : content.next}</Button>
    </>}
    {stage === "commitment" && <>
      <fieldset className="space-y-2">
        <legend className="sr-only">{content.choiceTitle}</legend>
        {content.promises.map((promise, index) => <label key={promise.title} className={cn("flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-4 focus-within:ring-2 focus-within:ring-ring", commitment === index ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "bg-background hover:bg-muted/40")}>
          <input type="radio" name={`${id}-commitment`} checked={commitment === index} onChange={() => setCommitment(index)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-700" />
          <span className="leading-relaxed">{promise.title}</span>
        </label>)}
      </fieldset>
      <Button className="min-h-11" disabled={commitment === null} onClick={() => { setStage("done"); focusHeading(); }}>{content.confirm}</Button>
    </>}
    {stage === "done" && commitment !== null && <>
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/40">
        <p className="flex items-start gap-3 text-lg font-bold"><Check className="mt-1 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />{content.promises[commitment].title}</p>
        <p className="mt-3 leading-relaxed text-muted-foreground">{content.promises[commitment].action}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {audience === "student" && <Button asChild className="min-h-11"><Link href="/student-ask">{content.goAsk}</Link></Button>}
        <Button variant="outline" className="min-h-11" onClick={startPractice}>{content.retry}</Button>
      </div>
    </>}
    {stage !== "overview" && <Button variant="ghost" className="min-h-11" onClick={() => { setStage("overview"); focusHeading(); }}>{content.overview}</Button>}
  </div>;
}
