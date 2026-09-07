import { BookOpen, CalendarDays, BarChart3, Dices, House, Lightbulb, MessageCircle, PencilLine, Search, Settings, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/** 메뉴와 페이지 제목이 같은 그림을 사용해 활동을 쉽게 알아볼 수 있게 한다. */
export function LearningSectionIcon({ href, compact = false }: { href?: string; compact?: boolean }) {
  const path = href ?? "";
  const Icon = path.includes("question-learning") ? BookOpen
    : path.includes("question-play") ? Dices
    : path.includes("practice") ? PencilLine
    : path.includes("dashboard") ? House
    : path.includes("sessions") || path.includes("curriculum") ? CalendarDays
    : path.includes("ask") ? MessageCircle
    : path.includes("questions") ? Search
    : path.includes("students") ? Users
    : path.includes("points") ? Trophy
    : path.includes("reports") ? BarChart3
    : path.includes("settings") ? Settings
    : Lightbulb;

  return (
    <span aria-hidden="true" className={cn("learning-section-icon inline-flex shrink-0 items-center justify-center", compact ? "h-5 w-5" : "h-12 w-12 rounded-2xl border border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200")}>
      <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} strokeWidth={2} />
    </span>
  );
}
