"use client";

import {
  buildSessionLabel,
  groupSessionDatesByMonth,
  groupSessionsByMonth,
  isInquiryDesignSession,
  type SortableSession,
} from "@/lib/sessions";

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
}: {
  sessions: T[];
  selectedSessionId: string;
  completedSessionIds?: Set<string>;
  onSelectSession: (id: string) => void;
  labels: {
    allSessions: string;
    selected: string;
    completed?: string;
    inquiryClass: string;
    noMatchingSession: string;
  };
}) {
  const sessionMonthGroups = groupSessionsByMonth(sessions);

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-5 text-center text-sm text-muted-foreground">
        {labels.noMatchingSession}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-pressed={selectedSessionId === "all"}
        onClick={() => onSelectSession("all")}
        className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          selectedSessionId === "all"
            ? "border-indigo-300 bg-indigo-50 text-indigo-950 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-950/40 dark:text-indigo-100"
            : "border-border bg-background hover:border-indigo-200 hover:bg-indigo-50/60 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/20"
        }`}
      >
        <span className="text-sm font-semibold">{labels.allSessions}</span>
        {selectedSessionId === "all" && (
          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            {labels.selected}
          </span>
        )}
      </button>

      <div className="max-h-[22rem] space-y-4 overflow-y-auto pr-1">
        {sessionMonthGroups.map((group) => (
          <section key={group.key} className="space-y-2">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 py-2 text-xs font-semibold text-muted-foreground backdrop-blur">
              <span>{group.label}</span>
              <span>{group.sessions.length}개</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.sessions.map((session) => {
                const active = selectedSessionId === session.id;
                const completed = completedSessionIds?.has(session.id) ?? false;
                const inquiry = isInquiryDesignSession(session);

                return (
                  <button
                    key={session.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelectSession(session.id)}
                    className={`min-h-[112px] rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      active
                        ? "border-indigo-300 bg-indigo-50 text-indigo-950 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-950/40 dark:text-indigo-100"
                        : "border-border bg-background hover:border-indigo-200 hover:bg-indigo-50/60 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {session.date}
                      </span>
                      {active && (
                        <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                          {labels.selected}
                        </span>
                      )}
                      {!active && completed && labels.completed && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                          {labels.completed}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="line-clamp-1 text-sm font-semibold">{session.subject}</p>
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-muted-foreground">
                        {session.topic.trim() || "-"}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>{buildSessionLabel(session.date, session.subject, session.topic)}</span>
                        {inquiry && (
                          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                            {labels.inquiryClass}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
