import type { ReactNode } from "react";

/**
 * 공용 빈 상태 — 아이콘(이모지) + 제목 + 보조 설명 + 선택적 액션.
 * 목록·표·패널이 비었을 때 일관된 안내를 보여준다.
 */
export function EmptyState({
  icon = "📭",
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-4 py-10 text-center ${className}`}>
      <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 text-3xl text-sky-800 dark:bg-sky-950 dark:text-sky-200" aria-hidden>{icon}</div>
      <p className="text-lg font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-sm text-base leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
