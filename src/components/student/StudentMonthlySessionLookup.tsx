"use client";

import { useTranslations } from "next-intl";
import {
  groupSessionDatesByMonth,
  groupSessionsByMonth,
  isInquiryDesignSession,
  type SortableSession,
} from "@/lib/sessions";
import { useSessionMetaTranslation } from "@/components/shared/use-session-meta-translation";

export function StudentMonthlyDateSelect({
  dates,
  value,
  onChange,
  allLabel,
  ariaLabel,
  className = "flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
}: {
  dates: string[];
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  ariaLabel: string;
  className?: string;
}) {
  const dateMonthGroups = groupSessionDatesByMonth(dates);

  return (
    <select
      aria-label={ariaLabel}
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{allLabel}</option>
      {dateMonthGroups.map((group) => (
        <optgroup key={group.key} label={group.label}>
          {group.dates.map((date) => (
            <option key={date} value={date}>{date}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

type LookupSession = SortableSession & {
  id: string;
  subject: string;
  topic: string;
  unitDesignId?: string | null;
  sharedQuestions?: unknown[] | null;
};

export function StudentMonthlySessionLookup<T extends LookupSession>({
  sessions,
  selectedSessionId,
  completedSessionIds,
  onSelectSession,
  labels,
  className = "flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
}: {
  sessions: T[];
  selectedSessionId: string;
  completedSessionIds?: Set<string>;
  onSelectSession: (id: string) => void;
  className?: string;
  labels: {
    allSessions: string;
    completed?: string;
    inquiryClass: string;
    noMatchingSession: string;
  };
}) {
  const tCommon = useTranslations("common");
  const sessionMonthGroups = groupSessionsByMonth(sessions);
  const sessionText = useSessionMetaTranslation(sessions);

  if (sessions.length === 0) {
    return (
      <select className={className} value="" disabled aria-label={labels.allSessions}>
        <option value="">{labels.noMatchingSession}</option>
      </select>
    );
  }

  return (
    <select
      aria-label={labels.allSessions}
      className={className}
      value={selectedSessionId}
      onChange={(event) => onSelectSession(event.target.value)}
    >
      <option value="all">{labels.allSessions}</option>
      {sessionMonthGroups.map((group) => (
        <optgroup key={group.key} label={`${group.label} (${tCommon("itemCount", { count: group.sessions.length })})`}>
          {group.sessions.map((session) => {
            const completed = completedSessionIds?.has(session.id) ?? false;
            const suffixes = [
              isInquiryDesignSession(session) ? labels.inquiryClass : "",
              completed && labels.completed ? labels.completed : "",
            ].filter(Boolean);
            const label = sessionText.label(session);

            return (
              <option key={session.id} value={session.id}>
                {suffixes.length > 0 ? `${label} · ${suffixes.join(" · ")}` : label}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
}
