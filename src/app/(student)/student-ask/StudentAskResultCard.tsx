"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClassificationResult } from "./types";

interface StudentAskResultCardProps {
  result: ClassificationResult;
  analyzedContent: string;
  analysisCurrent: boolean;
  saveComplete: boolean;
  isSaving: boolean;
  onRewrite: () => void;
  onUseImprovedExample: (content: string) => void;
  onSave: () => void;
}

export function StudentAskResultCard({
  result,
  analyzedContent,
  analysisCurrent,
  saveComplete,
  isSaving,
  onRewrite,
  onUseImprovedExample,
  onSave,
}: StudentAskResultCardProps) {
  const t = useTranslations("ask");
  const tCls = useTranslations("classification");
  const cognitiveLabel = (value: string) =>
    value === "factual" ? tCls("factual.label")
      : value === "conceptual" ? tCls("conceptual.label")
      : value === "controversial" ? tCls("controversial.label")
      : value;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("resultHeader")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {result.analysisSource === "ai" && (
          <div
            role="status"
            className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-900 dark:border-sky-400/30 dark:bg-sky-950/40 dark:text-sky-100"
          >
            <p className="text-sm font-semibold">{t("aiAnalysisComplete")}</p>
          </div>
        )}

        {result.analysisSource === "fallback" && (
          <div
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <p className="text-sm font-semibold">{t("fallbackAnalysisNotice")}</p>
          </div>
        )}

        {!analysisCurrent && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="text-sm font-semibold">{t("reanalyzeBeforeSave")}</p>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-medium">{t("previousQuestion")}</summary>
              <p className="mt-2 text-amber-700 dark:text-amber-300">{analyzedContent}</p>
            </details>
          </div>
        )}

        {result.inappropriate && (
          <div className="p-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40">
            <p className="text-sm font-bold text-red-700">{t("inappropriateDetected")}</p>
            <p className="text-sm text-red-600 mt-1">
              {result.inappropriateReason || t("inappropriateDefault")} {t("inappropriateAdvice")}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
            <div className="text-sm text-muted-foreground">{t("closureLabel")}</div>
            <div className="text-xl font-bold text-blue-700">
              {result.closure === "closed" ? t("closedResult") : t("openResult")}
            </div>
            <div className="text-sm text-blue-600 mt-0.5">
              {result.closure === "closed" ? t("closedHint") : t("openHint")}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {t("confidence")}: {Math.round(result.closureScore * 100)}%
            </div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-950/40 rounded-lg">
            <div className="text-sm text-muted-foreground">{t("cognitiveLevel")}</div>
            <div className="text-xl font-bold text-purple-700">
              {cognitiveLabel(result.cognitive)}
            </div>
            <div className="text-sm text-purple-600 mt-0.5">
              {result.cognitive === "factual" && t("factualHint")}
              {result.cognitive === "conceptual" && t("conceptualHint")}
              {result.cognitive === "controversial" && t("controversialHint")}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {t("confidence")}: {Math.round(result.cognitiveScore * 100)}%
            </div>
          </div>
        </div>

        <div className="p-4 bg-muted/40 rounded-lg">
          <div className="text-sm font-medium text-foreground">{t("reasoning")}</div>
          <p className="text-muted-foreground mt-1">{result.reasoning}</p>
        </div>

        {result.feedback && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-lg">
            <div className="text-sm font-medium text-amber-800 mb-1">{t("feedbackTitle")}</div>
            <p className="text-amber-700">{result.feedback}</p>
          </div>
        )}

        {result.improvedExample && result.improvedExample.trim() && (
          <div className="p-4 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-500/30 rounded-lg">
            <div className="mb-2 text-sm font-medium text-green-800 dark:text-green-200">{t("improvedTitle")}</div>
            <p className="font-medium text-green-900 dark:text-green-100">&ldquo;{result.improvedExample}&rdquo;</p>
            <p className="mt-1 text-xs text-green-600 dark:text-green-300">{t("improveHint")}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-10"
              onClick={() => onUseImprovedExample(result.improvedExample!)}
            >
              {t("useImprovedExample")}
            </Button>
          </div>
        )}

        <div className="p-4 border rounded-lg bg-muted/40 text-sm text-muted-foreground">
          {t("visibilityByTeacher")}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="h-11 flex-1" disabled={isSaving} onClick={onRewrite}>
            {t("rewriteQuestion")}
          </Button>
          {!saveComplete && (
            <Button
              onClick={onSave}
              disabled={isSaving || !analysisCurrent}
              variant="gradient"
              className="h-11 flex-1 text-base font-semibold"
            >
              {isSaving ? t("saving") : t("saveQuestion")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
