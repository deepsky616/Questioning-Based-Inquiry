"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { BookOpenCheck, ListChecks, Plus, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export type QuestionClassWorkspaceView = "list" | "inquiry" | "quick";

interface QuestionClassWorkspaceNavProps {
  activeView: QuestionClassWorkspaceView;
}

function CreateClassAction({
  href, label, description, active, icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  active: boolean;
  icon: LucideIcon;
}) {
  const descriptionId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = (hovered || focused) && !dismissed;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [open]);

  return (
    <div
      className="relative min-w-0"
      onMouseEnter={() => { setHovered(true); setDismissed(false); }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => { setFocused(true); setDismissed(false); }}
      onBlur={() => setFocused(false)}
    >
      <Button asChild variant={active ? "default" : "outline"} className="h-11 w-full justify-start gap-2 sm:justify-center">
        <Link href={href} aria-current={active ? "page" : undefined} aria-describedby={descriptionId}>
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      </Button>
      <div id={descriptionId} role="tooltip" hidden={!open} className="absolute right-0 top-full z-50 w-80 max-w-[calc(100vw-3rem)] pt-2">
        <p className="rounded-lg border bg-popover p-4 text-sm leading-6 text-popover-foreground shadow-lg">
          {description}
        </p>
      </div>
    </div>
  );
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
        <CreateClassAction
          href="/teacher-sessions?view=quick"
          label={t("createQuickQuestionClass")}
          description={t("createQuickQuestionClassHelp")}
          active={activeView === "quick"}
          icon={Plus}
        />
        <CreateClassAction
          href="/teacher-curriculum"
          label={t("createInquiryQuestionClass")}
          description={t("createInquiryQuestionClassHelp")}
          active={activeView === "inquiry"}
          icon={BookOpenCheck}
        />
      </div>
    </nav>
  );
}
