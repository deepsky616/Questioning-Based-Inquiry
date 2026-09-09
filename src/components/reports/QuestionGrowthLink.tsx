"use client";

import Link from "next/link";
import { CheckCircle2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { growthQuestionHref } from "./question-growth-types";

export function QuestionGrowthLink({ questionId, complete = false, className }: { questionId: string; complete?: boolean; className?: string }) {
  const t = useTranslations("growth");
  const Icon = complete ? CheckCircle2 : Pencil;

  // 밝은 색을 명시해 전역 다크 테마 변환 규칙이 이 링크의 개별 테마 색을 덮어쓰지 않게 한다.
  return <Link href={growthQuestionHref(questionId)} className={cn(
    "inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    complete
      ? "border-[#a7f3d0] bg-[#ecfdf5] text-[#065f46] hover:bg-[#d1fae5] focus-visible:ring-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900 dark:focus-visible:ring-emerald-300"
      : "border-[#bfdbfe] bg-[#eff6ff] text-[#1e40af] hover:bg-[#dbeafe] focus-visible:ring-blue-600 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900 dark:focus-visible:ring-blue-300",
    className,
  )}>
    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
    <span>{t(complete ? "viewEdit" : "continue")}</span>
  </Link>;
}
