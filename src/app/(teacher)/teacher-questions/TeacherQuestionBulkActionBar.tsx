"use client";

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
    selectedLabel: string;
    title: string;
    description: string;
    deselect: string;
    plusCount: (count: number) => string;
    aiGenerating: string;
    aiPreview: string;
    bulkDeleting: string;
    bulkDelete: string;
  };
}

export function TeacherQuestionBulkActionBar({
  selectedCount,
  previewQuestions,
  hiddenPreviewCount,
  isGeneratingPreviews,
  isSendingPreviews,
  isBulkDeleting,
  bulkMsg,
  showBulkSuccess,
  onClearSelection,
  onPreviewBulkAi,
  onBulkDelete,
  labels,
}: TeacherQuestionBulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 px-4">
      <div className="pointer-events-auto mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-600 shadow-xl ring-1 ring-black/5">
        <div className="space-y-2.5 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex shrink-0 flex-col items-center leading-none">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-indigo-700 shadow-sm">
                  {selectedCount}
                </span>
                <span className="mt-1 text-[10px] font-medium text-indigo-100">{labels.selectedLabel}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{labels.title}</p>
                <p className="line-clamp-2 text-xs text-indigo-100">{labels.description}</p>
              </div>
            </div>
            <button
              onClick={onClearSelection}
              disabled={isGeneratingPreviews || isSendingPreviews || isBulkDeleting}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-indigo-100 underline-offset-4 hover:bg-white/10 hover:text-white hover:underline disabled:opacity-40"
            >
              {labels.deselect}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {previewQuestions.map((question) => (
              <span
                key={question.id}
                className="max-w-full truncate rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white ring-1 ring-white/20"
                title={`${question.author.name}: ${question.content}`}
              >
                {question.author.name}: {question.content.length > 24 ? `${question.content.slice(0, 24)}...` : question.content}
              </span>
            ))}
            {hiddenPreviewCount > 0 && (
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                {labels.plusCount(hiddenPreviewCount)}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={onPreviewBulkAi}
              disabled={isGeneratingPreviews || isSendingPreviews || isBulkDeleting}
              className="h-10 flex-1 bg-white font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:bg-white/60 disabled:text-indigo-300"
            >
              {isGeneratingPreviews ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
                  </svg>
                  {labels.aiGenerating}
                </span>
              ) : (
                labels.aiPreview
              )}
            </Button>
            <Button
              onClick={onBulkDelete}
              disabled={isGeneratingPreviews || isSendingPreviews || isBulkDeleting}
              className="h-10 shrink-0 border border-white/30 bg-white/10 font-semibold text-white hover:bg-red-500 hover:border-red-500 disabled:opacity-40 sm:w-auto"
            >
              {isBulkDeleting ? labels.bulkDeleting : labels.bulkDelete}
            </Button>
          </div>

          {bulkMsg && (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                bulkMsg.type === "success"
                  ? "bg-white text-indigo-700"
                  : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
              }`}
            >
              {bulkMsg.type === "success" && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                  ✓
                </span>
              )}
              <span className={showBulkSuccess ? "animate-pulse" : ""}>{bulkMsg.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
