"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DesignReferenceView, type DesignReference } from "@/components/shared/DesignReferenceView";
import { CollapseChevron } from "@/components/shared/SectionToggle";

/**
 * 세션이 탐구설계(탐구질문 수업)와 연결됐을 때 참고자료를 접기 패널로 보여준다.
 * 연결 설계가 없으면(null) 아무것도 렌더하지 않는다. 내 질문·전체 질문·수업 탐구 질문 공용.
 */
export function SessionReferencePanel({
  sessionId,
  defaultOpen = false,
}: {
  sessionId: string | null | undefined;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("ask");
  const [ctx, setCtx] = useState<DesignReference | null>(null);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    let cancelled = false;
    setCtx(null);
    setOpen(defaultOpen);
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}/design-context`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setCtx(d?.context ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, defaultOpen]);

  if (!ctx) return null;

  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-sm font-semibold text-indigo-700 dark:text-indigo-300"
      >
        <span>📚</span>
        {t("referenceTitle")}
        <CollapseChevron open={open} />
      </button>
      {open && <DesignReferenceView data={ctx} sourceSessionId={sessionId} className="mt-3" />}
    </div>
  );
}
