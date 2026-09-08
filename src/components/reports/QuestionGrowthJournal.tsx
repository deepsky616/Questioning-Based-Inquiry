"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Sprout } from "lucide-react";
import { getSessionUser } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/datetime";
import { QuestionGrowthContent } from "./QuestionGrowthContent";
import { growthQuestionHref, type GrowthJournalResponse } from "./question-growth-types";

export function QuestionGrowthJournal({ studentId, sessionId }: { studentId?: string; sessionId: string }) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  return <SessionGrowthRecords key={`${user.id}:${studentId ?? user.id}:${sessionId}`} userId={user.id} studentId={studentId} sessionId={sessionId} />;
}

function SessionGrowthRecords({ userId, studentId, sessionId }: { userId: string; studentId?: string; sessionId: string }) {
  const t = useTranslations("growth");
  const tc = useTranslations("common");
  const titleId = useId();
  const targetId = studentId || userId;
  const [page, setPage] = useState(1);
  const query = useQuery<GrowthJournalResponse>({
    queryKey: ["question-growth", userId, targetId, "session", sessionId, page],
    enabled: Boolean(userId && targetId && sessionId?.trim()),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ view: "session", studentId: targetId, sessionId, page: String(page) });
      const response = await fetch(`/api/question-growth?${params.toString()}`, { signal });
      if (!response.ok) throw new Error("성장 기록 조회 실패");
      return response.json();
    },
    retry: 1,
  });
  // 배포 도중 이전 응답이 와도 다른 수업이나 직접 쓴 내용이 없는 기록을 표시하지 않는다.
  const records = (query.data?.records ?? []).filter(record => record.question?.session?.id === sessionId && (record.changeNote?.trim() || record.reflection.trim()));
  const pageInfo = query.data?.pageInfo;
  if (!sessionId?.trim()) return null;

  return <section aria-labelledby={titleId} className="rounded-2xl border border-emerald-200 bg-card p-4 dark:border-emerald-900 sm:p-5">
    <h3 id={titleId} className="flex items-center gap-2 text-lg font-bold"><Sprout className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{t("sessionTitle")}</h3>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("sessionDescription")}</p>
    {query.isLoading && <p role="status" className="mt-4 text-sm">{t("loading")}</p>}
    {query.isError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-destructive"><span>{t("loadFailed")}</span><Button variant="outline" onClick={() => query.refetch()}>{tc("retry")}</Button></div>}
    {query.data && records.length === 0 && <p className="mt-4 rounded-lg bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">{t("sessionEmpty")}</p>}
    <div className="mt-4 space-y-4">
      {records.map(record => <article key={record.questionId} className="rounded-xl border p-4">
        <p className="mb-3 text-xs text-muted-foreground">{t("updatedOn", { date: formatDateOnly(record.updatedAt) })}</p>
        <div className="rounded-lg bg-muted/30 p-3 sm:p-4"><QuestionGrowthContent record={record} questionOnly /></div>
        <dl className="mt-4 space-y-4">
          {record.changeNote?.trim() && <div><dt className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{t("changeNote")}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed">{record.changeNote}</dd></div>}
          {record.reflection.trim() && <div><dt className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{t("reflection")}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-base leading-relaxed">{record.reflection}</dd></div>}
        </dl>
        {query.data?.canEdit && <Link href={growthQuestionHref(record.questionId)} className="no-print mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-300">{t("continue")}</Link>}
      </article>)}
    </div>
    {pageInfo && pageInfo.totalPages > 1 && <nav aria-label={t("pagesLabel")} className="no-print mt-4 flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" disabled={query.isFetching || pageInfo.page <= 1} onClick={() => setPage(pageInfo.page - 1)}>{t("previousPage")}</Button>
      <span className="text-sm tabular-nums text-muted-foreground">{t("pageCount", { page: pageInfo.page, pages: pageInfo.totalPages })}</span>
      <Button variant="outline" disabled={query.isFetching || pageInfo.page >= pageInfo.totalPages} onClick={() => setPage(pageInfo.page + 1)}>{t("nextPage")}</Button>
    </nav>}
  </section>;
}
