"use client";

import Link from "next/link";
import { BookOpenCheck, ListChecks, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export type QuestionClassWorkspaceView = "list" | "inquiry" | "quick";

interface QuestionClassWorkspaceNavProps {
  activeView: QuestionClassWorkspaceView;
}

export function QuestionClassWorkspaceNav({
  activeView,
}: QuestionClassWorkspaceNavProps) {
  const t = useTranslations("sessions");

  return (
    <nav
      aria-label={t("workspaceNavLabel")}
      className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <Button
        asChild
        variant={activeView === "list" ? "default" : "ghost"}
        className="h-10 justify-start gap-2 sm:w-auto"
      >
        <Link
          href="/teacher-sessions"
          aria-current={activeView === "list" ? "page" : undefined}
        >
          <ListChecks className="h-4 w-4" />
          {t("listViewTitle")}
        </Link>
      </Button>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          asChild
          variant={activeView === "inquiry" ? "default" : "outline"}
          className="h-10 justify-start gap-2 sm:justify-center"
        >
          <Link
            href="/teacher-curriculum"
            aria-current={activeView === "inquiry" ? "page" : undefined}
          >
            <BookOpenCheck className="h-4 w-4" />
            {t("createInquiryQuestionClass")}
          </Link>
        </Button>
        <Button
          asChild
          variant={activeView === "quick" ? "default" : "outline"}
          className="h-10 justify-start gap-2 sm:justify-center"
        >
          <Link
            href="/teacher-sessions?view=quick"
            aria-current={activeView === "quick" ? "page" : undefined}
          >
            <Plus className="h-4 w-4" />
            {t("createQuickQuestionClass")}
          </Link>
        </Button>
      </div>
    </nav>
  );
}
