"use client";

import type { ReactNode, RefObject } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionSession } from "./types";

interface FlowStep {
  step: number;
  label: string;
}

interface StudentAskInputCardProps {
  sessionSelector: ReactNode;
  selectedSession: QuestionSession | null;
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
  selectedSession,
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
      <CardContent className="student-ask-tablet-layout grid gap-4 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:items-stretch">
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

        <div className="student-ask-session-panel min-w-0 rounded-xl border bg-muted/30 p-4">
          {sessionSelector}
        </div>

        {/* flex-col — 남는 세로 공간을 질문 입력창이 흡수해 아래 여백이 생기지 않는다 */}
        <div className="student-ask-question-panel flex flex-col gap-4 rounded-xl border border-indigo-200 bg-card p-4 shadow-sm dark:border-indigo-500/30">
          {selectedSession && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-sm dark:border-indigo-500/30 dark:bg-indigo-950/25">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                  {t("currentSession")}
                </p>
                {selectedSession.unitDesignId && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                    {t("inquiryClassTag")}
                  </span>
                )}
              </div>
              <p className="mt-1 font-semibold text-indigo-950 dark:text-indigo-100">
                {selectedSession.subject}
                {selectedSession.topic.trim() && (
                  <span className="font-medium text-indigo-700 dark:text-indigo-200"> · {selectedSession.topic.trim()}</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-indigo-700 dark:text-indigo-200">
                {selectedSession.teacher.name} {t("teacherSuffix")} · {selectedSession.date}
              </p>
            </div>
          )}

          {existingQuestion && !isCheckingExisting && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm text-amber-800 dark:text-amber-300">
              {t("alreadyAsked")}: <strong>&ldquo;{existingQuestion.content.slice(0, 50)}{existingQuestion.content.length > 50 ? "..." : ""}&rdquo;</strong>
              <br />
              <span className="text-xs text-amber-600">{t("separateSaveNotice")}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="content">{t("questionLabel")}</Label>
            {/* 질문은 최대 200자 — 입력창은 6줄 고정, 남는 공간은 아래 도우미가 흡수한다 */}
            <Textarea
              ref={textareaRef}
              id="content"
              placeholder={t("questionPlaceholder")}
              value={content}
              maxLength={200}
              onChange={(event) => onContentChange(event.target.value)}
              rows={6}
              className="min-h-[10rem] resize-none text-base leading-7"
            />
            <p className="text-sm text-muted-foreground text-right">{content.length}/200</p>
          </div>

          {/* 좋은 질문 도우미 — 내용 크기만큼만 차지한다(남는 공간은 버튼 위 여백으로 분산) */}
          <div className="student-ask-question-helper flex flex-col gap-1.5 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 p-3 text-xs text-muted-foreground dark:border-indigo-500/30 dark:bg-indigo-950/20">
            <p className="text-sm font-semibold text-foreground">💡 {t("helperTitle")}</p>
            <p>{t("helperTipClosed")}</p>
            <p>{t("helperTipStage")}</p>
            <p className="italic">{t("helperExample")}</p>
            <Link href="/student-practice" className="mt-1 font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-300">
              {t("helperPracticeLink")} →
            </Link>
          </div>

          <Button
            onClick={onAnalyze}
            disabled={isLoading || !canAsk || content.trim().length === 0}
            variant="gradient"
            className="mt-auto h-12 w-full text-base font-semibold"
          >
            {isLoading ? t("analyzing") : t("analyze")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
