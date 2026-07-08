"use client";

import { useTranslations } from "next-intl";

import { AiLoadingProcess, type AiLoadingKind } from "@/components/shared/AiLoadingProcess";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface CurriculumSelectableTextStepProps {
  visible: boolean;
  titleKey: string;
  descriptionKey: string;
  selectedCount: number;
  items: string[];
  selectedIndices: number[];
  itemPrefix: "number" | "question";
  selectAriaKey: string;
  loading: boolean;
  loadingLabelKey: string;
  nextLabelKey: string;
  loadingKind: AiLoadingKind;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onToggle: (index: number) => void;
  onItemChange: (index: number, value: string) => void;
  onGoNext: () => void;
}

export function CurriculumSelectableTextStep({
  visible,
  titleKey,
  descriptionKey,
  selectedCount,
  items,
  selectedIndices,
  itemPrefix,
  selectAriaKey,
  loading,
  loadingLabelKey,
  nextLabelKey,
  loadingKind,
  onSelectAll,
  onDeselectAll,
  onToggle,
  onItemChange,
  onGoNext,
}: CurriculumSelectableTextStepProps) {
  const t = useTranslations("curriculum");
  if (!visible) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(titleKey)}</CardTitle>
        <CardDescription>{t(descriptionKey)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("selectedCount", { count: selectedCount })}</span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={onSelectAll}
              className="text-indigo-600 hover:text-indigo-800 underline"
            >
              {t("selectAll")}
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              type="button"
              onClick={onDeselectAll}
              className="text-indigo-600 hover:text-indigo-800 underline"
            >
              {t("deselectAll")}
            </button>
          </span>
        </div>
        {items.map((item, index) => (
          <div key={index} className="flex gap-2 items-start">
            <input
              type="checkbox"
              className="mt-2.5 h-4 w-4 shrink-0 accent-indigo-600"
              checked={selectedIndices.includes(index)}
              onChange={() => onToggle(index)}
              aria-label={t(selectAriaKey, { n: index + 1 })}
            />
            <span className="mt-2.5 text-xs font-bold text-indigo-500 shrink-0">
              {itemPrefix === "question" ? `Q${index + 1}` : index + 1}
            </span>
            <textarea
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              rows={2}
              value={item}
              onChange={(event) => onItemChange(index, event.target.value)}
            />
          </div>
        ))}
        <Button
          onClick={onGoNext}
          disabled={loading || selectedCount === 0}
          className="w-full"
        >
          {loading ? t(loadingLabelKey) : t(nextLabelKey)}
        </Button>
        {loading && <AiLoadingProcess kind={loadingKind} />}
      </CardContent>
    </Card>
  );
}
