"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCurrentUserIdentity } from "@/components/shared/current-user-identity";
import { reportTranslationFailure } from "@/components/shared/translation-feedback";
import { requestContentTranslations } from "@/lib/content-translation-client";
import { buildSessionLabel, formatSessionGradeLabel } from "@/lib/sessions";
import type { TranslatableItem } from "@/components/shared/use-content-translation";

export interface SessionMetaText {
  id: string;
  date: string;
  subject: string;
  topic: string;
  grade?: string | null;
  targetGrade?: string | null;
}

const keyOf = (type: TranslatableItem["type"], id: string) => `${type}:${id}`;

function uniqueSessions<T extends SessionMetaText>(sessions: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const session of sessions) {
    if (!session.id || seen.has(session.id)) continue;
    seen.add(session.id);
    result.push(session);
  }
  return result;
}

export function useSessionMetaTranslation<T extends SessionMetaText>(sessions: T[]) {
  const locale = useLocale();
  const canTranslate = locale !== "ko";
  const unique = useMemo(() => uniqueSessions(sessions), [sessions]);
  const userId = useCurrentUserIdentity();
  const queryClient = useQueryClient();
  const t = useTranslations("translate");
  const queries = useQueries({
    queries: unique.map(session => ({
      // 원문 값과 언어·사용자를 키에 포함해 수정되거나 언어가 바뀐 뒤의 낡은 번역을 막는다.
      queryKey: ["session-meta-translation", userId, locale, session.id, session.subject, session.topic],
      queryFn: () => {
        const items: TranslatableItem[] = [{ type: "SESSION_SUBJECT", id: session.id }];
        if (session.topic.trim()) items.push({ type: "SESSION_TOPIC", id: session.id });
        return requestContentTranslations(queryClient, userId!, locale, items);
      },
      enabled: canTranslate && userId !== null,
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

  const subject = useCallback(
    (session: SessionMetaText) => (canTranslate ? map[keyOf("SESSION_SUBJECT", session.id)] ?? session.subject : session.subject),
    [canTranslate, map],
  );
  const topic = useCallback(
    (session: SessionMetaText) => (canTranslate ? map[keyOf("SESSION_TOPIC", session.id)] ?? session.topic : session.topic),
    [canTranslate, map],
  );
  const grade = useCallback(
    (session: SessionMetaText) => {
      const match = unique.find((candidate) => candidate.id === session.id);
      return session.grade?.trim()
        || session.targetGrade?.trim()
        || match?.grade?.trim()
        || match?.targetGrade?.trim()
        || null;
    },
    [unique],
  );
  const gradeLabel = useCallback(
    (session: SessionMetaText) => formatSessionGradeLabel(grade(session), locale),
    [grade, locale],
  );
  const label = useCallback(
    (session: SessionMetaText) =>
      buildSessionLabel(
        session.date,
        subject(session),
        topic(session),
        grade(session),
        locale,
      ),
    [grade, locale, subject, topic],
  );
  const compactLabel = useCallback(
    (session: SessionMetaText) => {
      const translatedSubject = subject(session);
      const translatedTopic = topic(session);
      const translatedGrade = gradeLabel(session);
      return `${session.date} · ${translatedGrade ? `${translatedGrade} · ` : ""}${translatedSubject}${translatedTopic.trim() ? ` - ${translatedTopic}` : ""}`;
    },
    [gradeLabel, subject, topic],
  );
  const subjectOption = useCallback(
    (value: string) => {
      const match = unique.find((session) => session.subject === value);
      return match ? subject(match) : value;
    },
    [subject, unique],
  );
  const topicOption = useCallback(
    (value: string) => {
      const match = unique.find((session) => session.topic === value);
      return match ? topic(match) : value;
    },
    [topic, unique],
  );

  return {
    canTranslate,
    subject,
    topic,
    grade,
    gradeLabel,
    label,
    compactLabel,
    subjectOption,
    topicOption,
  };
}
