import type { ReactNode } from "react";

/**
 * 페이지 상단 공용 헤더 — 제목 + 설명 + 우측 액션 슬롯.
 * 모든 페이지의 헤더 정렬·간격을 통일한다.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        {description && <p className="text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
