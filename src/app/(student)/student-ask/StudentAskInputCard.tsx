"use client";

import type { ReactNode, RefObject } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSessionMetaTranslation } from "@/components/shared/use-session-meta-translation";
import type { QuestionSession } from "./types";

interface FlowStep {
  step: number;
  label: string;
}

interface StudentAskInputCardProps {
  sessionSelector: ReactNode;
  /** 작성 패널 옆 참고 자료(탐구질문·설계 맥락, 없으면 좋은 질문 도우미) */
  referencePanel: ReactNode;
  selectedSession: QuestionSession | null;
  flowSteps: FlowStep[];
  currentStep: number;
  existingQuestion: { id: string; content: string } | null;
  isCheckingExisting: boolean;
  content: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  canAsk: boolean;
  isLoading: boolean;
  hasAnalysis: boolean;
  onContentChange: (value: string) => void;
  onAnalyze: () => void;
}

// 단계형 배치: 세션 선택(전체 폭) → 아래 2단(왼쪽 질문 작성 / 오른쪽 참고 자료).
// 선택된 세션 정보는 카드 그리드 하이라이트가 이미 보여주므로 별도 카드로 중복하지 않고,
// 작성 라벨 옆 한 줄로만 맥락을 표시한다.
export function StudentAskInputCard({
  sessionSelector,
  referencePanel,
  selectedSession,
  flowSteps,
  currentStep,
  existingQuestion,
  isCheckingExisting,
  content,
  textareaRef,
  canAsk,
  isLoading,
  hasAnalysis,
  onContentChange,
  onAnalyze,
}: StudentAskInputCardProps) {
  const t = useTranslations("ask");
  const sessionText = useSessionMetaTranslation(selectedSession ? [selectedSession] : []);
  const currentSubject = selectedSession ? sessionText.subject(selectedSession) : "";
  const currentTopic = selectedSession ? sessionText.topic(selectedSession).trim() : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inputHeader")}</CardTitle>
        <CardDescription>{t("inputDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="student-ask-tablet-layout space-y-4">
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

        {/* 1단: 세션 선택 — 전체 폭이라 카드 그리드가 넓게 펼쳐져 세로로 짧아진다 */}
        <div className="student-ask-session-panel min-w-0 rounded-xl border bg-muted/30 p-4">
          {sessionSelector}
        </div>

        {/* 2단: 왼쪽 질문 작성 / 오른쪽 참고 자료 — 쓰면서 참고하는 흐름 */}
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          <div className="student-ask-question-panel flex flex-col gap-4 rounded-xl border border-indigo-200 bg-card p-4 shadow-sm dark:border-indigo-500/30">
            {existingQuestion && !isCheckingExisting && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                {t("alreadyAsked")}: <strong>&ldquo;{existingQuestion.content.slice(0, 50)}{existingQuestion.content.length > 50 ? "..." : ""}&rdquo;</strong>
                <br />
                <span className="text-xs text-amber-600">{t("separateSaveNotice")}</span>
              </div>
            )}

            {/* 현재 세션 하이라이트 바 — 선택 그리드가 스크롤로 안 보일 때 유일한 맥락 표시라
                또렷하게, 단 예전 정보 카드만큼 부풀리지는 않는다(중복 재발 방지).
                밝은 테마: indigo-50 배경 + 흰 칩 / 어두운 테마: indigo-950 배경 + indigo-900 칩 */}
            {selectedSession && (
              <div className="student-ask-current-session flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-500/40 dark:bg-indigo-950/40">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-300/80">
                  {t("currentSession")}
                </span>
                <span className="text-sm font-bold text-indigo-950 dark:text-indigo-50">
                  {currentSubject}
                  {currentTopic && (
                    <span className="font-semibold text-indigo-700 dark:text-indigo-200"> · {currentTopic}</span>
                  )}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700 shadow-sm dark:bg-indigo-900 dark:text-indigo-100">
                  📅 {selectedSession.date}
                </span>
                {selectedSession.unitDesignId && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700 shadow-sm dark:bg-indigo-900 dark:text-indigo-100">
                    🔍 {t("inquiryClassTag")}
                  </span>
                )}
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700 shadow-sm dark:bg-indigo-900 dark:text-indigo-100">
                  {selectedSession.defaultQuestionPublic ? `🌐 ${t("public")}` : `🔒 ${t("private")}`}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="content">{t("questionLabel")}</Label>
              {/* 질문은 최대 200자 — 입력창은 6줄 고정 */}
              <Textarea
                ref={textareaRef}
                id="content"
                value={content}
                maxLength={200}
                onChange={(event) => onContentChange(event.target.value)}
                rows={6}
                className="min-h-[10rem] resize-none text-base leading-7"
              />
              <p className="text-sm text-muted-foreground text-right">{content.length}/200</p>
            </div>

            <Button
              onClick={onAnalyze}
              disabled={isLoading || !canAsk || content.trim().length === 0}
              variant="gradient"
              className="h-12 w-full text-base font-semibold"
            >
              {isLoading ? t("analyzing") : hasAnalysis ? t("reanalyze") : t("analyze")}
            </Button>
          </div>

          {referencePanel}
        </div>
      </CardContent>
    </Card>
  );
}
