"use client";

import { useId, useState } from "react";
import { CalendarDays, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
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
  choices?: DashboardQuestionClassRowItem[];
  onSelect: (item: DashboardQuestionClassRowItem) => void;
  onRetry: () => void;
  labels: {
    empty: string;
    loading: string;
    error: string;
    retry: string;
    expand?: string;
    collapse?: string;
  };
}

export function DashboardQuestionClassRow({
  status,
  item,
  choices = [],
  onSelect,
  onRetry,
  labels,
}: DashboardQuestionClassRowProps) {
  const [expandedChoiceKey, setExpandedChoiceKey] = useState<string | null>(null);
  const choicesId = useId();
  const selectableChoices = choices.length > 0 ? choices : item ? [item] : [];
  const hasMultipleChoices = selectableChoices.length > 1;
  const choiceKey = JSON.stringify(
    selectableChoices.map(({ id, label, countLabel, detail, href }) => ({
      id,
      label,
      countLabel,
      detail,
      href,
    })),
  );
  const expanded = hasMultipleChoices && expandedChoiceKey === choiceKey;

  const selectSummary = () => {
    if (hasMultipleChoices) {
      setExpandedChoiceKey((current) => current === choiceKey ? null : choiceKey);
      return;
    }
    if (selectableChoices[0]) onSelect(selectableChoices[0]);
  };

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
          onClick={selectSummary}
          aria-expanded={hasMultipleChoices ? expanded : undefined}
          aria-controls={hasMultipleChoices ? choicesId : undefined}
          aria-label={[
            item.label,
            item.countLabel,
            item.detail,
            hasMultipleChoices ? (expanded ? labels.collapse : labels.expand) : "",
          ].filter(Boolean).join(" ")}
          title={hasMultipleChoices ? (expanded ? labels.collapse : labels.expand) : undefined}
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
          {hasMultipleChoices ? (
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </button>
      )}

      {status === "ready" && item && hasMultipleChoices && expanded && (
        <div id={choicesId} className="mt-2 space-y-1 border-l border-border pl-7">
          {selectableChoices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => {
                setExpandedChoiceKey(null);
                onSelect(choice);
              }}
              aria-label={[choice.label, choice.detail, choice.countLabel].filter(Boolean).join(" ")}
              className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{choice.label}</span>
                {choice.detail && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{choice.detail}</span>
                )}
              </span>
              {choice.countLabel && (
                <span className="shrink-0 text-xs font-semibold text-primary">{choice.countLabel}</span>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
