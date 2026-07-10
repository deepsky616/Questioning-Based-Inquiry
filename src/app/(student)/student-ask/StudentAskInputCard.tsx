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
      {/* items-stretch — 왼쪽(세션 목록)과 오른쪽(질문 입력)의 높이를 항상 맞춘다 */}
      <CardContent className="student-ask-tablet-layout grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] md:items-stretch">
        <div className="grid grid-cols-3 gap-2 md:col-span-2">
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

        <div className="min-w-0">
          {sessionSelector}
        </div>

        {/* flex-col — 남는 세로 공간을 질문 입력창이 흡수해 아래 여백이 생기지 않는다 */}
        <div className="student-ask-question-panel flex flex-col gap-4 rounded-xl border bg-background p-4">
          {existingQuestion && !isCheckingExisting && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm text-amber-800 dark:text-amber-300">
              {t("alreadyAsked")}: <strong>&ldquo;{existingQuestion.content.slice(0, 50)}{existingQuestion.content.length > 50 ? "..." : ""}&rdquo;</strong>
              <br />
              <span className="text-xs text-amber-600">{t("separateSaveNotice")}</span>
            </div>
          )}

          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="content">{t("questionLabel")}</Label>
            <Textarea
              ref={textareaRef}
              id="content"
              placeholder={t("questionPlaceholder")}
              value={content}
              maxLength={200}
              onChange={(event) => onContentChange(event.target.value)}
              rows={7}
              className="min-h-[12rem] flex-1 text-base leading-7 md:min-h-[16rem]"
            />
            <p className="text-sm text-muted-foreground text-right">{content.length}/200</p>
          </div>

          <Button
            onClick={onAnalyze}
            disabled={isLoading || !canAsk || content.trim().length === 0}
            variant="gradient"
            className="h-12 w-full text-base font-semibold"
          >
            {isLoading ? t("analyzing") : t("analyze")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
