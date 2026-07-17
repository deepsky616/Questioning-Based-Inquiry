"use client";

import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { QuestionClassViewHeader } from "../teacher-sessions/QuestionClassViewHeader";
import { QuestionClassWorkspaceNav } from "../teacher-sessions/QuestionClassWorkspaceNav";

export function InquiryQuestionClassWorkspaceHeader() {
  const tPages = useTranslations("pages");
  const tSessions = useTranslations("sessions");

  return (
    <>
      <PageHeader
        title={tPages("teacherSessions.title")}
        description={tPages("teacherSessions.description")}
      />
      <QuestionClassWorkspaceNav activeView="inquiry" />
      <QuestionClassViewHeader
        title={tSessions("inquiryViewTitle")}
        description={tSessions("inquiryViewDesc")}
      />
      <aside className="flex gap-3 rounded-xl border border-border bg-muted/35 p-4">
        <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {tSessions("inquiryHelperTitle")}
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {tSessions("inquiryHelperDesc")}
          </p>
        </div>
      </aside>
    </>
  );
}
