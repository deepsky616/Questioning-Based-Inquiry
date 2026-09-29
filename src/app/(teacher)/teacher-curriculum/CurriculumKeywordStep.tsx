"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { AiLoadingProcess } from "@/components/shared/AiLoadingProcess";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface CurriculumKeywordStepProps {
  visible: boolean;
  recommendedKeywords: string[];
  selectedKeywords: string[];
  customKeyword: string;
  loadingSentences: boolean;
  onToggleKeyword: (keyword: string) => void;
  onRemoveKeyword: (keyword: string) => void;
  onCustomKeywordChange: (value: string) => void;
  onAddCustomKeyword: () => void;
  onGoNext: () => void;
}

export function CurriculumKeywordStep({
  visible,
  recommendedKeywords,
  selectedKeywords,
  customKeyword,
  loadingSentences,
  onToggleKeyword,
  onRemoveKeyword,
  onCustomKeywordChange,
  onAddCustomKeyword,
  onGoNext,
}: CurriculumKeywordStepProps) {
  const t = useTranslations("curriculum");
  if (!visible) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("step2Title")}</CardTitle>
        <CardDescription>{t("step2Desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {recommendedKeywords.map((keyword) => (
            <div
              key={keyword}
              className={`inline-flex max-w-full rounded-full text-sm font-medium border transition-colors ${
                selectedKeywords.includes(keyword)
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-card text-muted-foreground border-input hover:border-indigo-400"
              }`}
            >
              <button
                type="button"
                aria-pressed={selectedKeywords.includes(keyword)}
                disabled={loadingSentences}
                onClick={() => onToggleKeyword(keyword)}
                className="min-h-11 min-w-0 rounded-l-full px-3 py-1.5 text-left [overflow-wrap:anywhere] hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {keyword}
              </button>
              <button
                type="button"
                aria-label={t("removeKeywordAria", { keyword })}
                title={t("removeKeywordAria", { keyword })}
                disabled={loadingSentences}
                onClick={() => onRemoveKeyword(keyword)}
                className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-r-full border-l border-current/20 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder={t("keywordPlaceholder")}
            value={customKeyword}
            disabled={loadingSentences}
            onChange={(event) => onCustomKeywordChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onAddCustomKeyword()}
            className="min-w-0 max-w-xs"
          />
          <Button variant="outline" size="sm" className="shrink-0 whitespace-nowrap" disabled={loadingSentences} onClick={onAddCustomKeyword}>
            {t("addBtn")}
          </Button>
        </div>

        {selectedKeywords.length > 0 && (
          <div className="rounded-md bg-indigo-50 dark:bg-indigo-950/40 px-4 py-2">
            <span className="text-xs text-indigo-600 font-medium">{t("selectedKeywords")}</span>
            <span className="text-sm text-indigo-800">{selectedKeywords.join(", ")}</span>
          </div>
        )}

        <Button
          onClick={onGoNext}
          disabled={loadingSentences || selectedKeywords.length === 0}
          className="w-full"
        >
          {loadingSentences ? t("loadingSentences") : t("nextSentences")}
        </Button>
        {loadingSentences && <AiLoadingProcess kind="unitDesignSentences" />}
      </CardContent>
    </Card>
  );
}
