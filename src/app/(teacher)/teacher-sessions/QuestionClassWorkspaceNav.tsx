"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpenCheck, CircleHelp, ListChecks, MessageCircle, type LucideIcon } from "lucide-react";
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
  const tc = useTranslations("common");
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = (hovered || focused || pinned) && !dismissed;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDismissed(true); setPinned(false); }
    };
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setDismissed(true);
        setPinned(false);
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
      className="relative flex min-w-0 items-center gap-1"
      onMouseEnter={() => { setHovered(true); setDismissed(false); }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => { setFocused(true); setDismissed(false); }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setPinned(false); }
      }}
    >
      <Button asChild variant={active ? "default" : "outline"} className="h-11 w-full justify-start gap-2 sm:justify-center">
        <Link href={href} aria-current={active ? "page" : undefined} aria-describedby={descriptionId}>
          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
          {label}
        </Link>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 text-primary"
        aria-label={`${label} ${tc("help")}`}
        aria-expanded={open}
        aria-controls={descriptionId}
        onClick={() => { setPinned(!pinned); setDismissed(pinned); }}
      >
        <CircleHelp className="h-5 w-5" aria-hidden="true" />
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
