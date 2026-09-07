"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DeployedDesignList, type RevealDeployedDesign } from "./DeployedDesignList";
import { QuestionSequencePanel } from "./QuestionSequencePanel";
import type { QuestionSession } from "./types";

export function TeacherInquiryDesignWorkspace({ currentSession, sessions, onChanged }: {
  currentSession?: QuestionSession;
  sessions: QuestionSession[];
  onChanged: () => void | Promise<unknown>;
}) {
  const t = useTranslations("teacherQ");
  const [revealRequest, setRevealRequest] = useState<RevealDeployedDesign>();
  // 목록 필터와 무관하게 선택한 수업의 실제 배포 자료로 판단한다.
  const hasDeployedDesign = (currentSession?.sharedQuestions?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {currentSession && (
        <section aria-label={t("sequenceTitle")} className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-foreground">
            <span aria-hidden="true">🧩</span>
            {t("sequenceTitle")}
          </h2>
          {hasDeployedDesign ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm leading-6 text-muted-foreground">{t("sequenceAlreadyDeployed")}</p>
              <Button variant="outline" onClick={() => setRevealRequest({ sessionId: currentSession.id })}>
                {t("viewDeployedDesign")}
              </Button>
            </div>
          ) : (
            <div className="mt-3">
              <QuestionSequencePanel
                key={currentSession.id}
                sessionId={currentSession.id}
                subject={currentSession.subject}
                topic={currentSession.topic}
                onDeployed={() => {
                  setRevealRequest({ sessionId: currentSession.id });
                  void onChanged();
                }}
              />
            </div>
          )}
        </section>
      )}
      <DeployedDesignList
        sessions={sessions}
        onChanged={onChanged}
        revealRequest={revealRequest?.sessionId === currentSession?.id ? revealRequest : undefined}
      />
    </div>
  );
}
