"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown, Search, Sprout } from "lucide-react";
import { getSessionUser } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateOnly } from "@/lib/datetime";
import { useSessionMetaTranslation } from "@/components/shared/use-session-meta-translation";
import { QuestionGrowthContent } from "./QuestionGrowthContent";
import { growthQuestionHref, type GrowthJournalResponse } from "./question-growth-types";

type StatusFilter = "all" | "pending" | "complete";

export function QuestionGrowthJournal({ studentId, sessionId }: { studentId?: string; sessionId?: string }) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  return <AccountGrowthJournal key={`${user.id}:${studentId ?? user.id}:${sessionId ?? "all"}`} userId={user.id} studentId={studentId} sessionId={sessionId} />;
}

function AccountGrowthJournal({ userId, studentId, sessionId }: { userId: string; studentId?: string; sessionId?: string }) {
  const t = useTranslations("growth");
  const tc = useTranslations("common");
  const titleId = useId();
  const targetId = studentId || userId;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<{ q: string; status: StatusFilter; page: number }>({ q: "", status: "all", page: 1 });
  const query = useQuery<GrowthJournalResponse>({
    queryKey: ["question-growth", userId, targetId, "journal", sessionId ?? "all", filters],
    enabled: Boolean(userId && targetId),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ view: "journal", studentId: targetId, page: String(filters.page), status: filters.status });
      if (sessionId) params.set("sessionId", sessionId);
      if (filters.q) params.set("q", filters.q);
      const response = await fetch(`/api/question-growth?${params.toString()}`, { signal });
      if (!response.ok) throw new Error("성장 기록 조회 실패");
      return response.json();
    },
    retry: 1,
  });
  const records = query.data?.records ?? [];
  const sessionText = useSessionMetaTranslation(records.flatMap(record => record.question?.session ? [record.question.session] : []));
  const pageInfo = query.data?.pageInfo;
  const summary = query.data?.summary;
  const filtered = Boolean(filters.q || filters.status !== "all");
  const clearFilters = () => { setSearch(""); setFilters({ q: "", status: "all", page: 1 }); };
  const Heading = sessionId ? "h3" : "h2";

  return <section id={sessionId ? undefined : "question-growth-library"} aria-labelledby={titleId} className="scroll-mt-24 rounded-2xl border border-emerald-200 bg-card p-4 shadow-sm dark:border-emerald-900 sm:p-6">
    <Heading id={titleId} className="flex items-center gap-2 text-lg font-bold"><Sprout className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{t(sessionId ? "sessionTitle" : "libraryTitle")}</Heading>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(sessionId ? "sessionDescription" : "libraryDescription")}</p>
    <div className="no-print mt-4 space-y-3">
      <form role="search" aria-label={t("searchLabel")} className="flex gap-2" onSubmit={event => { event.preventDefault(); setFilters(previous => ({ ...previous, q: search.trim(), page: 1 })); }}>
        <Input type="search" aria-label={t("searchLabel")} placeholder={t("searchHint")} value={search} maxLength={200} onChange={event => setSearch(event.target.value)} className="h-11 min-w-0 text-base" />
        <Button type="submit" variant="outline" className="h-11 shrink-0 gap-1.5"><Search className="h-4 w-4" aria-hidden="true" />{t("search")}</Button>
      </form>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("statusFilter")}>
        {(["all", "pending", "complete"] as const).map(status => <button key={status} type="button" aria-pressed={filters.status === status} onClick={() => setFilters(previous => ({ ...previous, status, page: 1 }))} className={`min-h-11 rounded-full border px-3 py-2 text-sm font-semibold ${filters.status === status ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}>
          {t(`filter_${status}`)}{summary && <span className="ml-1.5 tabular-nums">{status === "all" ? summary.total : summary[status]}</span>}
        </button>)}
      </div>
    </div>
    {query.isLoading && <p role="status" className="mt-4 text-sm">{t("loading")}</p>}
    {query.isError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-destructive"><span>{t("loadFailed")}</span><Button variant="outline" onClick={() => query.refetch()}>{tc("retry")}</Button></div>}
    {pageInfo && <p role="status" className="mt-4 text-sm text-muted-foreground">{t("resultCount", { count: pageInfo.total })}</p>}
    {query.data && records.length === 0 && <div className="mt-4 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
      <p>{t(filtered ? "noMatches" : studentId ? "teacherEmpty" : "empty")}</p>
      {filtered ? <Button className="mt-2" variant="outline" onClick={clearFilters}>{t("showAll")}</Button> : query.data.canEdit && <Link href="/student-questions?tab=mine" className="no-print mt-2 inline-flex min-h-11 items-center font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-300">{t("chooseMyQuestion")}</Link>}
    </div>}
    <div className="mt-4 space-y-3">
      {records.map(record => {
        const lesson = record.question?.session;
        return <article key={record.questionId} className="overflow-hidden rounded-xl border">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs leading-relaxed">
                  <span className={`rounded-full px-2 py-1 font-semibold ${record.reflection.trim() ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}`}>{t(record.reflection.trim() ? "filter_complete" : "filter_pending")}</span>
                  <span className="break-words text-muted-foreground">{lesson ? sessionText.label(lesson) : t("noSession")}</span>
                </div>
                <p className="line-clamp-2 break-words text-base font-semibold leading-relaxed">{record.revisedContent}</p>
                <span className="mt-2 block text-xs text-muted-foreground">{t("updatedOn", { date: formatDateOnly(record.updatedAt) })}</span>
              </div>
            </summary>
            <div className="border-t bg-muted/20 p-4"><QuestionGrowthContent record={record} /></div>
          </details>
          {query.data?.canEdit && <div className="no-print border-t px-4"><Link href={growthQuestionHref(record.questionId)} className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 underline underline-offset-4 dark:text-emerald-300">{t("continue")}</Link></div>}
        </article>;
      })}
    </div>
    {pageInfo && pageInfo.totalPages > 1 && <nav aria-label={t("pagesLabel")} className="no-print mt-4 flex flex-wrap items-center justify-between gap-3">
      <Button variant="outline" disabled={query.isFetching || pageInfo.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: pageInfo.page - 1 }))}>{t("previousPage")}</Button>
      <span className="text-sm tabular-nums text-muted-foreground">{t("pageCount", { page: pageInfo.page, pages: pageInfo.totalPages })}</span>
      <Button variant="outline" disabled={query.isFetching || pageInfo.page >= pageInfo.totalPages} onClick={() => setFilters(previous => ({ ...previous, page: pageInfo.page + 1 }))}>{t("nextPage")}</Button>
    </nav>}
  </section>;
}
