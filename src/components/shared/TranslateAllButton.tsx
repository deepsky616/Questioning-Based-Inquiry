"use client";

import { useTranslations } from "next-intl";
import type { TranslatableItem, useContentTranslation } from "@/components/shared/use-content-translation";

/**
 * 목록 전체 번역/원문 전환 버튼. ko 로케일이거나 항목이 없으면 렌더하지 않는다.
 * - 아직 번역이 안 켜진 항목이 남아 있으면 "모두 번역"을 우선한다
 *   (일부만 번역된 상태에서 두 번 눌러야 하는 문제 방지).
 * - 요청 진행 중에는 "번역 중..."으로 비활성화한다.
 */
export function TranslateAllButton({
  items,
  ct,
  className = "",
}: {
  items: TranslatableItem[];
  ct: ReturnType<typeof useContentTranslation>;
  className?: string;
}) {
  const t = useTranslations("translate");
  if (!ct.canTranslate || items.length === 0) return null;
  const allShown = items.every((i) => ct.isShown(i));
  return (
    <button
      type="button"
      disabled={ct.busy}
      onClick={() => (allShown ? ct.showAllOriginal() : ct.translateAll(items))}
      className={`h-8 rounded-md border border-indigo-200 px-3 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 ${className}`}
    >
      {ct.busy ? t("translating") : allShown ? t("showAllOriginal") : `🌐 ${t("translateAll")}`}
    </button>
  );
}
