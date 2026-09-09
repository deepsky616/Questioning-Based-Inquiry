"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/datetime";

interface Review { id: string; previousClosure: string; previousCognitive: string; closure: string; cognitive: string; reason: string; createdAt: string; reviewer: { name: string } | null }

export function QuestionClassificationReview({ questionId, reviewed, teacher = false }: { questionId: string; reviewed: boolean; teacher?: boolean }) {
  const t = useTranslations("classificationReview");
  const tc = useTranslations("common");
  const cls = useTranslations("classification");
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const query = useQuery<{ records: Review[]; page: number; hasMore: boolean }>({
    queryKey: ["classification-reviews", session?.user?.id, questionId, page], enabled: open && Boolean(session?.user?.id),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/questions/${encodeURIComponent(questionId)}/classification-reviews?page=${page}`, { signal });
      if (!response.ok) throw new Error("분류 확인 이력 조회 실패");
      return response.json();
    }, retry: 1,
  });
  const label = (value: string) => ["closed", "open", "factual", "conceptual", "controversial"].includes(value) ? cls(`${value}.label`) : value;
  if (!reviewed && !teacher) return null;
  return <>
    <Button type="button" variant="ghost" size="sm" className="mt-1 h-auto min-h-11 max-w-full gap-1.5 whitespace-normal px-2 text-left text-emerald-800 dark:text-emerald-200" onClick={() => { setPage(1); setOpen(true); }}>
      <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{t(reviewed ? "reviewed" : "open")}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t("title")}</DialogTitle><DialogDescription>{t("description")}</DialogDescription></DialogHeader>
        {query.isLoading && <p role="status">{tc("loading")}</p>}
        {query.isError && <div role="alert"><p>{t("error")}</p><Button className="mt-2" variant="outline" onClick={() => query.refetch()}>{tc("retry")}</Button></div>}
        {query.data && <>
          {!query.data.records.length && <p className="rounded-lg bg-muted p-4 text-sm leading-relaxed">{t("empty")}</p>}
          <ol className="space-y-4">{query.data.records.map(record => <li key={record.id} className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">{record.reviewer?.name || t("teacher")} · {formatDateTime(record.createdAt)}</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><dt className="text-sm font-semibold">{t("before")}</dt><dd className="mt-1">{label(record.previousClosure)} · {label(record.previousCognitive)}</dd></div>
              <div><dt className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{t("after")}</dt><dd className="mt-1">{label(record.closure)} · {label(record.cognitive)}</dd></div>
            </dl>
            {record.reason && <div className="mt-3 border-t pt-3"><p className="text-sm font-semibold">{t("reason")}</p><p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{record.reason}</p></div>}
          </li>)}</ol>
          {(page > 1 || query.data.hasMore) && <nav aria-label={t("pages")} className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" disabled={page <= 1 || query.isFetching} onClick={() => setPage(value => value - 1)}>{t("previous")}</Button>
            <span>{t("page", { page })}</span><Button variant="outline" disabled={!query.data.hasMore || query.isFetching} onClick={() => setPage(value => value + 1)}>{t("next")}</Button>
          </nav>}
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
