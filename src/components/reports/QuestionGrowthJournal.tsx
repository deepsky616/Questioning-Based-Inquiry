"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Sprout } from "lucide-react";
import { getSessionUser } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/datetime";
import { QuestionGrowthContent } from "./QuestionGrowthContent";
import { growthQuestionHref, type GrowthResponse } from "./question-growth-types";

export function QuestionGrowthJournal({ studentId }: { studentId?: string }) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const t = useTranslations("growth");
  const tc = useTranslations("common");
  const targetId = studentId || user.id;
  const query = useQuery<GrowthResponse>({
    queryKey: ["question-growth", user.id, targetId],
    enabled: Boolean(user.id && targetId),
    queryFn: async () => {
      const response = await fetch(`/api/question-growth?studentId=${encodeURIComponent(targetId ?? "")}`);
      if (!response.ok) throw new Error("성장 기록 조회 실패");
      return response.json();
    },
    retry: 1,
  });
  const records = query.data?.records ?? [];
  return <section className="rounded-2xl border border-emerald-200 bg-card p-4 shadow-sm dark:border-emerald-900 sm:p-6">
    <h2 className="flex items-center gap-2 text-lg font-bold"><Sprout className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{t("title")}</h2>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(studentId ? "teacherDescription" : "description")}</p>
    {query.isLoading && <p role="status" className="mt-4 text-sm">{t("loading")}</p>}
    {query.isError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-destructive"><span>{t("loadFailed")}</span><Button variant="outline" onClick={() => query.refetch()}>{tc("retry")}</Button></div>}
    {query.data && records.length === 0 && <div className="mt-4 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground"><p>{t(studentId ? "teacherEmpty" : "empty")}</p>{query.data.canEdit && <Link href="/student-ask" className="no-print mt-2 inline-flex min-h-11 items-center font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-300">{t("startQuestion")}</Link>}</div>}
    <div className="mt-5 space-y-4">
      {records.map(record => <article key={record.questionId} className="rounded-xl border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{formatDateOnly(record.updatedAt)}</p>{query.data?.canEdit && <Link href={growthQuestionHref(record.questionId)} className="no-print inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-300">{t("continue")}</Link>}</div>
        <QuestionGrowthContent record={record} />
      </article>)}
    </div>
  </section>;
}
