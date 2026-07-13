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
