"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCurrentUserIdentity } from "@/components/shared/current-user-identity";
import { reportTranslationFailure } from "@/components/shared/translation-feedback";
import { requestContentTranslations } from "@/lib/content-translation-client";

export interface TranslatableItem {
  type:
    | "QUESTION"
    | "COMMENT"
    | "SESSION_SUBJECT"
    | "SESSION_TOPIC"
    | "GAME_TITLE"
    | "GAME_DESCRIPTION"
    | "GAME_PLAYER_COUNT"
    | "GAME_DURATION"
    | "GAME_INSTRUCTION";
  id: string;
}

export interface TranslatableText extends TranslatableItem {
  original: string;
}

const keyOf = (item: TranslatableItem) => `${item.type}:${item.id}`;

/** 표시 중인 콘텐츠를 선택한 언어로 번역하고 사용자의 원문 보기 선택을 유지한다. */
export function useContentTranslation(items: TranslatableText[]) {
  const locale = useLocale();
  const canTranslate = locale !== "ko";
  const userId = useCurrentUserIdentity();
  const queryClient = useQueryClient();
  const t = useTranslations("translate");
  const [automatic, setAutomatic] = useState(true);
  const [originals, setOriginals] = useState<Set<string>>(new Set());
  const [requested, setRequested] = useState<TranslatableItem[]>([]);
  const requestedKeys = new Set(requested.map(keyOf));
  const unique = Array.from(new Map(items.map(item => [keyOf(item), item])).values());
  const queries = useQueries({
    queries: unique.map(item => ({
      queryKey: ["content-translation", userId, locale, item.type, item.id, item.original],
      queryFn: () => requestContentTranslations(queryClient, userId!, locale, [{type:item.type,id:item.id}]),
      enabled: canTranslate && userId !== null && !originals.has(keyOf(item)) && (automatic || requestedKeys.has(keyOf(item))),
      staleTime: 5 * 60_000,
      retry: false,
      retryOnMount: false,
      refetchOnWindowFocus: false,
    })),
  });
  const map: Record<string, string> = Object.assign({}, ...queries.map(query => query.data ?? {}));
  const error = queries.find(query => query.error)?.error;

  useEffect(() => {
    if (!error || !canTranslate) return;
    reportTranslationFailure(error, t("autoFailed"), t("retry"), () => {
      void queryClient.invalidateQueries({predicate: query =>
        ["session-meta-translation", "content-translation"].includes(String(query.queryKey[0])) &&
        query.queryKey[1] === userId && query.queryKey[2] === locale,
      });
    });
  }, [error, canTranslate, t, queryClient, userId, locale]);

  const isShown = (item: TranslatableItem) => canTranslate && !originals.has(keyOf(item)) &&
    (automatic || requestedKeys.has(keyOf(item))) && keyOf(item) in map;

  const translateAll = async (next: TranslatableItem[]) => {
    if (!canTranslate) return;
    const keys = new Set(next.map(keyOf));
    setOriginals(previous => new Set([...previous].filter(key => !keys.has(key))));
    setRequested(previous => Array.from(new Map([...previous, ...next].map(item => [keyOf(item), item])).values()));
    // 실패 뒤에도 번역 버튼으로 명시적으로 다시 시도할 수 있다.
    await queryClient.invalidateQueries({predicate: query =>
      query.queryKey[0] === "content-translation" && query.queryKey[1] === userId &&
      query.queryKey[2] === locale && keys.has(`${query.queryKey[3]}:${query.queryKey[4]}`) && query.state.status === "error",
    });
  };

  const toggle = async (item: TranslatableItem) => {
    if (isShown(item)) setOriginals(previous => new Set(previous).add(keyOf(item)));
    else await translateAll([item]);
  };

  const showAllOriginal = () => {
    setAutomatic(false);
    setRequested([]);
    setOriginals(new Set(unique.map(keyOf)));
  };

  return {
    canTranslate,
    toggle,
    translateAll,
    showAllOriginal,
    text: (item: TranslatableItem, original: string) => isShown(item) ? map[keyOf(item)] ?? original : original,
    isShown,
    isLoading: (item: TranslatableItem) => queries[unique.findIndex(candidate => keyOf(candidate) === keyOf(item))]?.isFetching ?? false,
    anyShown: unique.some(isShown),
    busy: queries.some(query => query.isFetching),
  };
}
