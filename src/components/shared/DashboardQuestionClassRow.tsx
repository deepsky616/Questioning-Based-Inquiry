"use client";

import { CalendarDays, ChevronRight, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface DashboardQuestionClassRowItem {
  id: string;
  label: string;
  countLabel: string;
  detail: string;
  href: string;
}

export interface DashboardQuestionClassRowProps {
  status: "loading" | "ready" | "error";
  item: DashboardQuestionClassRowItem | null;
  onSelect: (item: DashboardQuestionClassRowItem) => void;
  onRetry: () => void;
  labels: {
    empty: string;
    loading: string;
    error: string;
    retry: string;
  };
}

export function DashboardQuestionClassRow({
  status,
  item,
  onSelect,
  onRetry,
  labels,
}: DashboardQuestionClassRowProps) {
  return (
    <div className="mb-3 border-b border-border pb-3">
      {status === "loading" && (
        <div role="status" aria-label={labels.loading} className="space-y-2 py-1">
          <span className="sr-only">{labels.loading}</span>
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {status === "error" && (
        <div
          role="alert"
          className="flex min-h-12 items-center gap-3 px-1 text-sm text-destructive"
        >
          <CalendarDays className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{labels.error}</span>
          <button
            type="button"
            onClick={onRetry}
            title={labels.retry}
            aria-label={labels.retry}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {status === "ready" && !item && (
        <div className="flex min-h-12 items-center gap-3 px-1 text-sm text-muted-foreground">
          <CalendarDays className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{labels.empty}</span>
        </div>
      )}

      {status === "ready" && item && (
        <button
          type="button"
          data-testid="dashboard-question-class-row"
          onClick={() => onSelect(item)}
          aria-label={[item.label, item.countLabel, item.detail].filter(Boolean).join(" ")}
          className="grid min-h-12 w-full grid-cols-[20px_minmax(0,1fr)_auto_20px] items-center gap-3 px-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">{item.label}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detail}</span>
          </span>
          <span className="shrink-0 text-xs font-bold tabular-nums text-primary sm:text-sm">
            {item.countLabel}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
