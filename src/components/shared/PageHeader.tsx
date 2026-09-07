import type { ReactNode } from "react";
import { LearningSectionIcon } from "./LearningSectionIcon";

/**
 * 페이지 상단 공용 헤더 — 제목 + 설명 + 우측 액션 슬롯.
 * 모든 페이지의 헤더 정렬·간격을 통일한다.
 */
export function PageHeader({
  title,
  description,
  actions,
  iconHref,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  iconHref?: string;
}) {
  return (
    <div className="learning-page-header flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <LearningSectionIcon href={iconHref} />
        <div className="min-w-0">
          <h2 className="text-2xl font-bold leading-tight tracking-tight text-foreground">{title}</h2>
          {description && <p className="mt-2 max-w-3xl text-base leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="min-w-0 max-w-full">{actions}</div>}
    </div>
  );
}
