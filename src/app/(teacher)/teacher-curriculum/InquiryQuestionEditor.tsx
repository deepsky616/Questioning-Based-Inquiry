"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { InquiryQuestion } from "./types";

const TYPE_COLOR: Record<InquiryQuestion["type"], string> = {
  factual: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300",
  conceptual: "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-500/30 dark:bg-purple-950/40 dark:text-purple-300",
  controversial: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-950/40 dark:text-orange-300",
};

interface InquiryQuestionEditorProps {
  questions: InquiryQuestion[];
  selectedCount: number;
  dragIndex: number | null;
  addType: InquiryQuestion["type"];
  onSetDragIndex: (index: number | null) => void;
  onDrop: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onUpdate: (index: number, patch: Partial<InquiryQuestion>) => void;
  onRemove: (index: number) => void;
  onAddTypeChange: (type: InquiryQuestion["type"]) => void;
  onAdd: (type: InquiryQuestion["type"]) => void;
  onComplete: () => void;
}

export function InquiryQuestionEditor({
  questions,
  selectedCount,
  dragIndex,
  addType,
  onSetDragIndex,
  onDrop,
  onMove,
  onUpdate,
  onRemove,
  onAddTypeChange,
  onAdd,
  onComplete,
}: InquiryQuestionEditorProps) {
  const t = useTranslations("curriculum");
  const tc = useTranslations("common");
  const tCls = useTranslations("classification");
  const typeLabel = (type: InquiryQuestion["type"]) => tCls(`${type}.label`);
  const completedQuestionCount = questions.filter((question) => question.content.trim()).length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("selectedCount", { count: selectedCount })}</p>

      <div className="space-y-2.5">
        {questions.map((question, index) => (
          <div
            key={index}
            draggable
            aria-current={dragIndex === index ? "true" : undefined}
            onDragStart={() => onSetDragIndex(index)}
            onDragEnd={() => onSetDragIndex(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDrop(index)}
            className={`rounded-xl border px-3 py-3 shadow-sm ${TYPE_COLOR[question.type]}`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="flex shrink-0 items-center justify-between sm:mt-1 sm:flex-col">
                <GripVertical className="hidden h-4 w-4 cursor-grab text-current/55 sm:block" aria-hidden="true" />
                <div className="flex sm:flex-col">
                  <button
                    type="button"
                    onClick={() => onMove(index, -1)}
                    disabled={index === 0}
                    className="text-current/60 transition-colors hover:text-current disabled:opacity-30"
                    aria-label={t("moveUp")}
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(index, 1)}
                    disabled={index === questions.length - 1}
                    className="text-current/60 transition-colors hover:text-current disabled:opacity-30"
                    aria-label={t("moveDown")}
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <select
                value={question.type}
                onChange={(event) => onUpdate(index, { type: event.target.value as InquiryQuestion["type"] })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground sm:w-auto sm:shrink-0"
                aria-label={t("addQuestionType")}
              >
                <option value="factual">{typeLabel("factual")}</option>
                <option value="conceptual">{typeLabel("conceptual")}</option>
                <option value="controversial">{typeLabel("controversial")}</option>
              </select>
              <textarea
                className="w-full flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                rows={2}
                value={question.content}
                onChange={(event) => onUpdate(index, { content: event.target.value })}
              />
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="self-end text-sm text-red-500 transition-colors hover:text-red-700 sm:mt-1 sm:shrink-0 sm:self-auto"
                aria-label={tc("delete")}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={addType}
          onChange={(event) => onAddTypeChange(event.target.value as InquiryQuestion["type"])}
          className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          aria-label={t("addQuestionType")}
        >
          <option value="factual">{typeLabel("factual")}</option>
          <option value="conceptual">{typeLabel("conceptual")}</option>
          <option value="controversial">{typeLabel("controversial")}</option>
        </select>
        <Button type="button" variant="outline" size="sm" onClick={() => onAdd(addType)}>
          ＋ {t("addQuestion")}
        </Button>
      </div>

      {completedQuestionCount === 0 && (
        <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          {t("noInquiryToComplete")}
        </p>
      )}

      <Button
        type="button"
        variant="gradient"
        className="h-11 w-full text-base font-semibold"
        disabled={completedQuestionCount === 0}
        onClick={onComplete}
      >
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        {t("completeInquiryQuestions")}
      </Button>
    </div>
  );
}
