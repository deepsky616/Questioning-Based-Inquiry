"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuestionGrowthEditor } from "./QuestionGrowthEditor";
import { growthQuestionHref } from "./question-growth-types";

export function QuestionGrowthQuickReflection({ questionId, growthRecorded }: { questionId: string; growthRecorded: boolean }) {
  const t = useTranslations("growth");
  const [state, setState] = useState<"ask" | "write" | "later">("ask");
  return <section className="rounded-xl border border-emerald-200 bg-background p-4 dark:border-emerald-800 sm:p-5">
    <h3 className="flex items-center gap-2 text-base font-bold"><Sprout className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{t("quickTitle")}</h3>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(growthRecorded ? "autoRecorded" : "quickDescription")}</p>
    {state === "ask" && <div className="mt-3 flex flex-wrap gap-2"><Button type="button" onClick={() => setState("write")}>{t("writeNote")}</Button><Button type="button" variant="outline" onClick={() => setState("later")}>{t("later")}</Button></div>}
    {state === "write" && <div className="mt-4"><QuestionGrowthEditor questionId={questionId} quick /></div>}
    {state !== "ask" && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("continueHint")} <Link href={growthQuestionHref(questionId)} className="inline-flex min-h-11 items-center font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-300">{t("continue")}</Link></p>}
  </section>;
}
