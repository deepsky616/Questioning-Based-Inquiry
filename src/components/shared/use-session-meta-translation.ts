"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { buildSessionLabel } from "@/lib/sessions";
import type { TranslatableItem } from "@/components/shared/use-content-translation";

export interface SessionMetaText {
  id: string;
  date: string;
  subject: string;
  topic: string;
}

const keyOf = (type: TranslatableItem["type"], id: string) => `${type}:${id}`;
const BATCH_SIZE = 40;

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
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!canTranslate || unique.length === 0) return;
    let cancelled = false;
    const items: TranslatableItem[] = unique.flatMap((session) => {
      const next: TranslatableItem[] = [{ type: "SESSION_SUBJECT", id: session.id }];
      if (session.topic.trim()) next.push({ type: "SESSION_TOPIC", id: session.id });
      return next;
    });
    const missing = items.filter((item) => !(keyOf(item.type, item.id) in map));
    if (missing.length === 0) return;

    async function run() {
      const merged: Record<string, string> = {};
      for (let start = 0; start < missing.length; start += BATCH_SIZE) {
        const batch = missing.slice(start, start + BATCH_SIZE);
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: batch }),
        }).catch(() => null);
        if (!response?.ok) break;
        const data = await response.json().catch(() => ({}));
        if (data?.translations) Object.assign(merged, data.translations as Record<string, string>);
      }
      if (!cancelled && Object.keys(merged).length > 0) {
        setMap((previous) => ({ ...previous, ...merged }));
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [canTranslate, unique, map]);

  const subject = useCallback(
    (session: SessionMetaText) => (canTranslate ? map[keyOf("SESSION_SUBJECT", session.id)] ?? session.subject : session.subject),
    [canTranslate, map],
  );
  const topic = useCallback(
    (session: SessionMetaText) => (canTranslate ? map[keyOf("SESSION_TOPIC", session.id)] ?? session.topic : session.topic),
    [canTranslate, map],
  );
  const label = useCallback(
    (session: SessionMetaText) => buildSessionLabel(session.date, subject(session), topic(session)),
    [subject, topic],
  );
  const compactLabel = useCallback(
    (session: SessionMetaText) => {
      const translatedSubject = subject(session);
      const translatedTopic = topic(session);
      return `${session.date} · ${translatedSubject}${translatedTopic.trim() ? ` - ${translatedTopic}` : ""}`;
    },
    [subject, topic],
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

  return { canTranslate, subject, topic, label, compactLabel, subjectOption, topicOption };
}
