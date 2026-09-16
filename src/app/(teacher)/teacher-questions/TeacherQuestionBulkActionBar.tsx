"use client";

import { useId, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Question } from "./types";

interface TeacherQuestionBulkActionBarProps {
  selectedCount: number;
  previewQuestions: Question[];
  hiddenPreviewCount: number;
  isGeneratingPreviews: boolean;
  isSendingPreviews: boolean;
  isBulkDeleting: boolean;
  bulkMsg: { type: "success" | "error"; text: string } | null;
  showBulkSuccess: boolean;
  onClearSelection: () => void;
  onPreviewBulkAi: () => void;
  onBulkDelete: () => void;
  labels: {
    selectedSummary: string;
    actionsLabel: string;
    title: string;
    description: string;
    openPanel: string;
    closePanel: string;
    more: string;
    moreLabel: string;
    deselect: string;
    plusCount: (count: number) => string;
    aiGenerating: string;
    aiPreview: string;
    bulkDeleting: string;
    bulkDelete: string;
  };
}

export function TeacherQuestionBulkActionBar({
  selectedCount, previewQuestions, hiddenPreviewCount, isGeneratingPreviews,
  isSendingPreviews, isBulkDeleting, bulkMsg, showBulkSuccess,
  onClearSelection, onPreviewBulkAi, onBulkDelete, labels,
}: TeacherQuestionBulkActionBarProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const busy = isGeneratingPreviews || isSendingPreviews || isBulkDeleting;

  function closePanel() {
    setPanelOpen(false);
    openButtonRef.current?.focus();
  }

  if (selectedCount === 0) return null;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 dark:border-indigo-900 dark:bg-indigo-950/20">
      <div role="group" aria-label={labels.actionsLabel} className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span role="status" className="mr-auto whitespace-nowrap text-sm font-semibold tabular-nums">
          {labels.selectedSummary}
        </span>
        <Button ref={openButtonRef} type="button" variant="outline" size="sm" disabled={busy}
          aria-expanded={panelOpen} aria-controls={panelId}
          onClick={() => setPanelOpen(value => !value)} className="gap-1.5 whitespace-nowrap">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />{labels.openPanel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClearSelection} disabled={busy} className="whitespace-nowrap">
          {labels.deselect}
        </Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={labels.moreLabel} className="gap-1 whitespace-nowrap">
              {isBulkDeleting ? labels.bulkDeleting : labels.more}<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
              <DropdownMenu.Item disabled={busy} onSelect={onBulkDelete}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive outline-none focus:bg-destructive/10 data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />{labels.bulkDelete}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {panelOpen && (
        <section id={panelId} aria-labelledby={`${panelId}-title`} className="space-y-3 border-t border-indigo-200 p-3 dark:border-indigo-900">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 id={`${panelId}-title`} className="text-sm font-semibold">{labels.title}</h4>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{labels.description}</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={closePanel} disabled={busy} className="shrink-0 whitespace-nowrap">
              {labels.closePanel}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {previewQuestions.map(question => (
              <span key={question.id} className="max-w-full truncate rounded-md border bg-background px-2 py-1 text-xs"
                title={`${question.author.name}: ${question.content}`}>
                {question.author.name}: {question.content.length > 24 ? `${question.content.slice(0, 24)}…` : question.content}
              </span>
            ))}
            {hiddenPreviewCount > 0 && <span className="whitespace-nowrap rounded-md border bg-background px-2 py-1 text-xs tabular-nums">{labels.plusCount(hiddenPreviewCount)}</span>}
          </div>
          <Button type="button" onClick={onPreviewBulkAi} disabled={busy} className="h-auto min-h-10 gap-2 whitespace-normal py-2">
            {isGeneratingPreviews ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {isGeneratingPreviews ? labels.aiGenerating : labels.aiPreview}
          </Button>
        </section>
      )}

      {bulkMsg && <p role={bulkMsg.type === "error" ? "alert" : "status"}
        className={`mx-3 mb-3 rounded-md px-3 py-2 text-sm ${bulkMsg.type === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"} ${showBulkSuccess ? "font-semibold" : ""}`}>
        {bulkMsg.text}
      </p>}
    </div>
  );
}
