"use client";

import type { ReactNode, RefObject } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface FlowStep {
  step: number;
  label: string;
}

interface StudentAskInputCardProps {
  sessionSelector: ReactNode;
  flowSteps: FlowStep[];
  currentStep: number;
  existingQuestion: { id: string; content: string } | null;
  isCheckingExisting: boolean;
  content: string;
  textareaRef: RefObject<HTMLTextAreaElement>;
  canAsk: boolean;
  isLoading: boolean;
  onContentChange: (value: string) => void;
  onAnalyze: () => void;
}

export function StudentAskInputCard({
  sessionSelector,
  flowSteps,
  currentStep,
  existingQuestion,
  isCheckingExisting,
  content,
  textareaRef,
  canAsk,
  isLoading,
  onContentChange,
  onAnalyze,
}: StudentAskInputCardProps) {
  const t = useTranslations("ask");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inputHeader")}</CardTitle>
        <CardDescription>{t("inputDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {flowSteps.map((item) => {
            const active = item.step === currentStep;
            const done = item.step < currentStep;
            return (
              <div
                key={item.step}
                className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${
                  active
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-200"
                    : done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                <span className="mr-1">{item.step}</span>
                {item.label}
              </div>
            );
          })}
        </div>

        {sessionSelector}

        {existingQuestion && !isCheckingExisting && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm text-amber-800 dark:text-amber-300">
            {t("alreadyAsked")}: <strong>&ldquo;{existingQuestion.content.slice(0, 50)}{existingQuestion.content.length > 50 ? "..." : ""}&rdquo;</strong>
            <br />
            <span className="text-xs text-amber-600">{t("separateSaveNotice")}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="content">{t("questionLabel")}</Label>
          <Textarea
            ref={textareaRef}
            id="content"
            placeholder={t("questionPlaceholder")}
            value={content}
            maxLength={200}
            onChange={(event) => onContentChange(event.target.value)}
            rows={4}
          />
          <p className="text-sm text-muted-foreground text-right">{content.length}/200</p>
        </div>

        <Button
          onClick={onAnalyze}
          disabled={isLoading || !canAsk || content.trim().length === 0}
          variant="gradient"
          className="h-11 w-full text-base font-semibold"
        >
          {isLoading ? t("analyzing") : t("analyze")}
        </Button>
      </CardContent>
    </Card>
  );
}
