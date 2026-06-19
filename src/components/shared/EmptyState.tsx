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
      <div className="text-3xl opacity-80" aria-hidden>{icon}</div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
