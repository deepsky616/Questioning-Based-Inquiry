"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface TeacherQuestionPageNavigationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  labels: {
    previous: string;
    next: string;
    status: (page: number, totalPages: number, total: number) => string;
  };
}

export function TeacherQuestionPageNavigation({
  page,
  totalPages,
  total,
  onPageChange,
  labels,
}: TeacherQuestionPageNavigationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="flex items-center justify-center gap-3 border-t border-border pt-3" aria-label={labels.status(page, totalPages, total)}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label={labels.previous}
        title={labels.previous}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="min-w-0 text-center text-xs font-medium text-muted-foreground">
        {labels.status(page, totalPages, total)}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label={labels.next}
        title={labels.next}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
