"use client";

import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useToast } from "@/components/ui/use-toast";

export interface TranslatableItem {
  type: "QUESTION" | "COMMENT";
  id: string;
}

const keyOf = (type: string, id: string) => `${type}:${id}`;

// 서버 스키마(items.max)와 동일하게 유지 — 넘으면 400으로 거부된다
const BATCH_SIZE = 40;

/**
 * 사용자 콘텐츠(질문·댓글) 온디맨드 번역 토글 상태를 관리하는 훅.
 * - 한국어 로케일에서는 비활성(canTranslate=false).
 * - toggle: 항목별 원문/번역 전환(번역 미보유 시 /api/translate 호출).
 * - translateAll/showAllOriginal: 페이지 전체 전환(서버 한도에 맞춰 40개씩 분할 요청).
 * - text(item, original): 현재 상태에 맞는 표시 텍스트 반환.
 * - 실패(레이트 리밋·AI 설정 없음·번역 오류)는 토스트로 알린다.
 */
export function useContentTranslation() {
  const locale = useLocale();
  const canTranslate = locale !== "ko";
  const { toast } = useToast();
  const t = useTranslations("translate");

  const [map, setMap] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());

  /** 미보유 항목만 번역 요청하고 결과 맵을 반환(상태에도 병합). 오류 메시지는 error로 전달 */
  const fetchMissing = useCallback(
    async (items: TranslatableItem[]): Promise<{ translations: Record<string, string>; error: string | null }> => {
      const need = items.filter((i) => !(keyOf(i.type, i.id) in map));
      if (need.length === 0) return { translations: {}, error: null };
      const needKeys = need.map((i) => keyOf(i.type, i.id));
      setLoading((prev) => {
        const n = new Set(prev);
        needKeys.forEach((k) => n.add(k));
        return n;
      });
      const merged: Record<string, string> = {};
      let error: string | null = null;
      try {
        // 서버 items 한도(40)에 맞춰 분할 요청 — 목록이 길어도 '모두 번역'이 동작하도록
        for (let start = 0; start < need.length; start += BATCH_SIZE) {
          const batch = need.slice(start, start + BATCH_SIZE);
          try {
            const res = await fetch("/api/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: batch }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              error = typeof data?.error === "string" ? data.error : t("translateFailed");
              break; // 레이트 리밋 등 — 남은 배치를 계속 보내지 않는다
            }
            if (data?.translations) Object.assign(merged, data.translations as Record<string, string>);
          } catch {
            error = t("translateFailed");
            break;
          }
        }
        if (Object.keys(merged).length > 0) {
          setMap((prev) => ({ ...prev, ...merged }));
        }
        return { translations: merged, error };
      } finally {
        setLoading((prev) => {
          const n = new Set(prev);
          needKeys.forEach((k) => n.delete(k));
          return n;
        });
      }
    },
    [map, t],
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
      if (k in map) {
        setShown((prev) => new Set(prev).add(k));
        return;
      }
      const { translations, error } = await fetchMissing([item]);
      if (k in translations) {
        setShown((prev) => new Set(prev).add(k));
      } else {
        // 실패(오류) 또는 권한 등으로 번역 대상에서 제외된 경우 — 조용히 무시하지 않는다
        toast({ variant: "destructive", description: error ?? t("translateFailed") });
      }
    },
    [shown, map, fetchMissing, toast, t],
  );

  const translateAll = useCallback(
    async (items: TranslatableItem[]) => {
      const { translations, error } = await fetchMissing(items);
      const ok = items.filter((i) => {
        const k = keyOf(i.type, i.id);
        return k in translations || k in map;
      });
      if (ok.length > 0) {
        setShown((prev) => {
          const n = new Set(prev);
          ok.forEach((i) => n.add(keyOf(i.type, i.id)));
          return n;
        });
      }
      if (error && ok.length === 0) {
        toast({ variant: "destructive", description: error });
      }
    },
    [fetchMissing, map, toast],
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

  return {
    canTranslate,
    toggle,
    translateAll,
    showAllOriginal,
    text,
    isShown,
    isLoading,
    anyShown: shown.size > 0,
    /** 하나라도 번역 요청이 진행 중인가 — '모두 번역' 버튼 로딩 표시용 */
    busy: loading.size > 0,
  };
}
