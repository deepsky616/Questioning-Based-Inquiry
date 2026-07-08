"use client";

import { useTranslations } from "next-intl";

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
            <button
              key={keyword}
              onClick={() => onToggleKeyword(keyword)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedKeywords.includes(keyword)
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-card text-muted-foreground border-input hover:border-indigo-400"
              }`}
            >
              {keyword}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder={t("keywordPlaceholder")}
            value={customKeyword}
            onChange={(event) => onCustomKeywordChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onAddCustomKeyword()}
            className="max-w-xs"
          />
          <Button variant="outline" size="sm" onClick={onAddCustomKeyword}>
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
