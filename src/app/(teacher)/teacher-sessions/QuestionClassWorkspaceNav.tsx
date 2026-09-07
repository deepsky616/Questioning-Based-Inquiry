"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpenCheck, ListChecks, MessageCircle, type LucideIcon } from "lucide-react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = (hovered || focused) && !dismissed;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setDismissed(true);
      }
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="question-class-action relative min-w-0"
      onMouseEnter={() => { setHovered(true); setDismissed(false); }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => { setFocused(true); setDismissed(false); }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <Button asChild variant={active ? "default" : "outline"} className="h-11 w-full justify-start gap-2 sm:justify-center">
        <Link href={href} aria-current={active ? "page" : undefined} aria-describedby={descriptionId} onClick={() => setDismissed(true)}>
          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          {label}
        </Link>
      </Button>
      <div id={descriptionId} className="question-class-help" data-open={open}>
        <p>
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
      className="flex flex-col gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between"
    >
      <Button
        asChild
        variant={activeView === "list" ? "default" : "ghost"}
        className="h-10 shrink-0 justify-start gap-2 sm:w-auto"
      >
        <Link
          href="/teacher-sessions"
          aria-current={activeView === "list" ? "page" : undefined}
        >
          <ListChecks className="h-4 w-4" />
          {t("listViewTitle")}
        </Link>
      </Button>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:max-w-2xl sm:grid-cols-2">
        <CreateClassAction
          href="/teacher-sessions?view=quick"
          label={t("createQuickQuestionClass")}
          description={t("createQuickQuestionClassHelp")}
          active={activeView === "quick"}
          icon={MessageCircle}
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
