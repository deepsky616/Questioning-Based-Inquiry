import { isValidSessionDateString } from "@/lib/sessions";

export interface DashboardQuestionClassSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  isActive?: boolean;
}

export type DashboardQuestionClassSchedule<TSession extends DashboardQuestionClassSession> = {
  kind: "today" | "upcoming" | "empty";
  date: string | null;
  totalCount: number;
  needsQuestionCount: number | null;
  primarySession: TSession | null;
};

export function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function buildDashboardQuestionClassSchedule<
  TSession extends DashboardQuestionClassSession,
>({
  sessions,
  today,
  completedSessionIds,
}: {
  sessions: TSession[];
  today: string;
  completedSessionIds?: ReadonlySet<string>;
}): DashboardQuestionClassSchedule<TSession> {
  const eligibleSessions = sessions.filter(
    (session) =>
      session.isActive !== false && isValidSessionDateString(session.date),
  );
  const todaySessions = eligibleSessions.filter(
    (session) => session.date === today,
  );

  if (todaySessions.length > 0) {
    const needsQuestion = completedSessionIds
      ? todaySessions.filter((session) => !completedSessionIds.has(session.id))
      : [];

    return {
      kind: "today",
      date: today,
      totalCount: todaySessions.length,
      needsQuestionCount: completedSessionIds ? needsQuestion.length : null,
      primarySession: needsQuestion[0] ?? todaySessions[0],
    };
  }

  const upcomingDates = eligibleSessions
    .map((session) => session.date)
    .filter((date) => date > today)
    .sort();
  const nearestDate = upcomingDates[0];
  if (!nearestDate) {
    return {
      kind: "empty",
      date: null,
      totalCount: 0,
      needsQuestionCount: null,
      primarySession: null,
    };
  }

  const nearestSessions = eligibleSessions.filter(
    (session) => session.date === nearestDate,
  );
  const needsQuestion = completedSessionIds
    ? nearestSessions.filter((session) => !completedSessionIds.has(session.id))
    : [];

  return {
    kind: "upcoming",
    date: nearestDate,
    totalCount: nearestSessions.length,
    needsQuestionCount: completedSessionIds ? needsQuestion.length : null,
    primarySession: needsQuestion[0] ?? nearestSessions[0],
  };
}
