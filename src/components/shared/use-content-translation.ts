"use client";

import { useCallback, useState } from "react";
import { useLocale } from "next-intl";

export interface TranslatableItem {
  type: "QUESTION" | "COMMENT";
  id: string;
}

const keyOf = (type: string, id: string) => `${type}:${id}`;

/**
 * 사용자 콘텐츠(질문·댓글) 온디맨드 번역 토글 상태를 관리하는 훅.
 * - 한국어 로케일에서는 비활성(canTranslate=false).
 * - toggle: 항목별 원문/번역 전환(번역 미보유 시 /api/translate 호출).
 * - translateAll/showAllOriginal: 페이지 전체 전환.
 * - text(item, original): 현재 상태에 맞는 표시 텍스트 반환.
 */
export function useContentTranslation() {
  const locale = useLocale();
  const canTranslate = locale !== "ko";

  const [map, setMap] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());

  /** 미보유 항목만 번역 요청하고 결과 맵을 반환(상태에도 병합) */
  const fetchMissing = useCallback(
    async (items: TranslatableItem[]): Promise<Record<string, string>> => {
      const need = items.filter((i) => !(keyOf(i.type, i.id) in map));
      if (need.length === 0) return {};
      const needKeys = need.map((i) => keyOf(i.type, i.id));
      setLoading((prev) => {
        const n = new Set(prev);
        needKeys.forEach((k) => n.add(k));
        return n;
      });
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: need }),
        });
        const data = await res.json().catch(() => ({}));
        const translations: Record<string, string> = res.ok && data?.translations ? data.translations : {};
        if (Object.keys(translations).length > 0) {
          setMap((prev) => ({ ...prev, ...translations }));
        }
        return translations;
      } finally {
        setLoading((prev) => {
          const n = new Set(prev);
          needKeys.forEach((k) => n.delete(k));
          return n;
        });
      }
    },
    [map],
  );

  const toggle = useCallback(
    async (item: TranslatableItem) => {
      const k = keyOf(item.type, item.id);
      if (shown.has(k)) {
        setShown((prev) => {
          const n = new Set(prev);
          n.delete(k);
          return n;
        });
        return;
      }
      const have = k in map ? { [k]: map[k] } : await fetchMissing([item]);
      if (k in have || k in map) {
        setShown((prev) => new Set(prev).add(k));
      }
    },
    [shown, map, fetchMissing],
  );

  const translateAll = useCallback(
    async (items: TranslatableItem[]) => {
      const fetched = await fetchMissing(items);
      const ok = items.filter((i) => {
        const k = keyOf(i.type, i.id);
        return k in fetched || k in map;
      });
      if (ok.length > 0) {
        setShown((prev) => {
          const n = new Set(prev);
          ok.forEach((i) => n.add(keyOf(i.type, i.id)));
          return n;
        });
      }
    },
    [fetchMissing, map],
  );

  const showAllOriginal = useCallback(() => setShown(new Set()), []);

  const text = useCallback(
    (item: TranslatableItem, original: string) => {
      const k = keyOf(item.type, item.id);
      return shown.has(k) ? map[k] ?? original : original;
    },
    [shown, map],
  );

  const isShown = useCallback((item: TranslatableItem) => shown.has(keyOf(item.type, item.id)), [shown]);
  const isLoading = useCallback((item: TranslatableItem) => loading.has(keyOf(item.type, item.id)), [loading]);

  return { canTranslate, toggle, translateAll, showAllOriginal, text, isShown, isLoading, anyShown: shown.size > 0 };
}
