"use client";

import { useTranslations } from "next-intl";
import type { TranslatableItem, useContentTranslation } from "@/components/shared/use-content-translation";

/** 항목별 원문/번역 전환 버튼. ko 로케일에서는 렌더하지 않는다. */
export function TranslateToggle({
  item,
  ct,
  className = "",
}: {
  item: TranslatableItem;
  ct: ReturnType<typeof useContentTranslation>;
  className?: string;
}) {
  const t = useTranslations("translate");
  if (!ct.canTranslate) return null;
  const loading = ct.isLoading(item);
  const shown = ct.isShown(item);
  return (
    <button
      type="button"
      onClick={() => ct.toggle(item)}
      disabled={loading}
      className={`text-[11px] font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 ${className}`}
    >
      {loading ? t("translating") : shown ? t("showOriginal") : t("translate")}
    </button>
  );
}
