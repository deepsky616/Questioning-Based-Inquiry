import { isValidSessionDateString } from "@/lib/sessions";

export type PriorityCountKey =
  | "flagged"
  | "points"
  | "attention"
  | "teacherRequest"
  | "pastUnasked";

export interface PriorityCount {
  key: PriorityCountKey;
  count: number;
}

export interface TeacherPriorityInput {
  flaggedCount: number;
  pendingPointCount: number;
  students: Array<{
    id: string;
    hasQuestion: boolean;
    remainingSessionCount: number;
  }>;
}

export interface StudentPriorityInput {
  teacherRequests: Array<{
    id: string;
    sessionId?: string | null;
  }>;
  todayUnaskedSessionIds: string[];
  pastUnaskedSessionIds: string[];
}

export const DASHBOARD_MISSED_SESSION_LOOKBACK_DAYS = 30;

function dateKeyDaysBefore(dateKey: string, days: number): string | null {
  if (!isValidSessionDateString(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day - days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function isDashboardActionableSessionDate(
  sessionDate: string,
  today: string,
): boolean {
  if (!isValidSessionDateString(sessionDate)) return false;
  const oldestDate = dateKeyDaysBefore(today, DASHBOARD_MISSED_SESSION_LOOKBACK_DAYS);
  return Boolean(oldestDate && sessionDate >= oldestDate && sessionDate <= today);
}

export function buildStudentSessionProgress({
  sessions,
  completedSessionIds,
  today,
}: {
  sessions: Array<{ id: string; date: string }>;
  completedSessionIds: ReadonlySet<string>;
  today: string;
}) {
  const completed = sessions.filter((session) => completedSessionIds.has(session.id)).length;
  const total = sessions.length;
  const remaining = Math.max(total - completed, 0);
  const actionableRemaining = sessions.filter(
    (session) =>
      !completedSessionIds.has(session.id) &&
      isDashboardActionableSessionDate(session.date, today),
  ).length;

  return {
    total,
    completed,
    remaining,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    actionableRemaining,
  };
}

export function selectActionableSessionReminders<
  TReminder extends { id: string; sessionId?: string | null },
>({
  reminders,
  availableSessionIds,
  completedSessionIds,
}: {
  reminders: TReminder[];
  availableSessionIds: ReadonlySet<string>;
  completedSessionIds: ReadonlySet<string>;
}): TReminder[] {
  return reminders.filter(
    (reminder) =>
      Boolean(reminder.sessionId) &&
      availableSessionIds.has(reminder.sessionId as string) &&
      !completedSessionIds.has(reminder.sessionId as string),
  );
}

export function buildTeacherPriorityCounts(input: TeacherPriorityInput): PriorityCount[] {
  const attention = new Set(
    input.students
      .filter((student) => !student.hasQuestion || student.remainingSessionCount > 0)
      .map((student) => student.id),
  ).size;

  return [
    { key: "flagged", count: input.flaggedCount },
    { key: "points", count: input.pendingPointCount },
    { key: "attention", count: attention },
  ].filter((item): item is PriorityCount => item.count > 0);
}

export function buildStudentPriorityCounts(input: StudentPriorityInput): PriorityCount[] {
  const teacherRequestSessionIds = new Set(
    input.teacherRequests.map((request) => request.sessionId ?? request.id),
  );
  const todayUnaskedSessionIds = new Set(
    input.todayUnaskedSessionIds.filter((sessionId) => !teacherRequestSessionIds.has(sessionId)),
  );
  const pastUnaskedSessionIds = new Set(
    input.pastUnaskedSessionIds.filter(
      (sessionId) =>
        !teacherRequestSessionIds.has(sessionId) && !todayUnaskedSessionIds.has(sessionId),
    ),
  );

  return [
    { key: "teacherRequest", count: teacherRequestSessionIds.size },
    { key: "pastUnasked", count: pastUnaskedSessionIds.size },
  ].filter((item): item is PriorityCount => item.count > 0);
}
