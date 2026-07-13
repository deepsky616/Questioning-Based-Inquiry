import { isInquiryDesignSession, isValidSessionDateString } from "@/lib/sessions";

export interface DashboardQuestionClassSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  isActive?: boolean;
  targetType?: string | null;
  targetGrade?: string | null;
  targetClassName?: string | null;
  targetStudentId?: string | null;
  targetStudentIds?: unknown;
  unitDesignId?: string | null;
  sharedQuestions?: unknown[] | null;
}

export interface DashboardQuestionClassScope {
  grade: string;
  className: string;
  studentIds: ReadonlySet<string>;
}

type DashboardQueryStatus = "pending" | "success" | "error";

export function resolveDashboardScheduleStatus({
  schedule,
  scope,
  requiresScope,
}: {
  schedule: DashboardQueryStatus;
  scope: DashboardQueryStatus;
  requiresScope: boolean;
}): "loading" | "ready" | "error" {
  if (schedule === "error" || (requiresScope && scope === "error")) return "error";
  if (schedule === "success" && (!requiresScope || scope === "success")) return "ready";
  return "loading";
}

export type DashboardQuestionClassSchedule<TSession extends DashboardQuestionClassSession> = {
  kind: "today" | "upcoming" | "empty";
  date: string | null;
  totalCount: number;
  needsQuestionCount: number | null;
  primarySession: TSession | null;
  selectableSessions: TSession[];
};

export function teacherDashboardSessionHref(
  session: DashboardQuestionClassSession,
): string {
  const path = session.unitDesignId && !isInquiryDesignSession(session)
    ? "/teacher-sessions"
    : "/teacher-questions";
  return `${path}?session=${encodeURIComponent(session.id)}`;
}

export function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function dashboardSessionMatchesClass(
  session: DashboardQuestionClassSession,
  scope: DashboardQuestionClassScope,
): boolean {
  if (!session.targetType || session.targetType === "ALL") return true;
  const targetStudentIds = jsonStringArray(session.targetStudentIds);
  const targetsScopedStudent = targetStudentIds.some((id) => scope.studentIds.has(id));

  if (session.targetType === "CLASS" || session.targetType === "CUSTOM") {
    return (
      (session.targetGrade === scope.grade && session.targetClassName === scope.className) ||
      targetsScopedStudent
    );
  }
  if (session.targetType === "STUDENT") {
    return (
      Boolean(session.targetStudentId && scope.studentIds.has(session.targetStudentId)) ||
      targetsScopedStudent
    );
  }
  return false;
}

export function buildDashboardQuestionClassSchedule<
  TSession extends DashboardQuestionClassSession,
>({
  sessions,
  today,
  completedSessionIds,
  classScope,
}: {
  sessions: TSession[];
  today: string;
  completedSessionIds?: ReadonlySet<string>;
  classScope?: DashboardQuestionClassScope;
}): DashboardQuestionClassSchedule<TSession> {
  const eligibleSessions = sessions.filter(
    (session) =>
      session.isActive !== false &&
      isValidSessionDateString(session.date) &&
      (!classScope || dashboardSessionMatchesClass(session, classScope)),
  );
  const todaySessions = eligibleSessions.filter(
    (session) => session.date === today,
  );

  if (todaySessions.length > 0) {
    const needsQuestion = completedSessionIds
      ? todaySessions.filter((session) => !completedSessionIds.has(session.id))
      : [];
    const selectableSessions = completedSessionIds
      ? [
          ...needsQuestion,
          ...todaySessions.filter((session) => completedSessionIds.has(session.id)),
        ]
      : todaySessions;

    return {
      kind: "today",
      date: today,
      totalCount: todaySessions.length,
      needsQuestionCount: completedSessionIds ? needsQuestion.length : null,
      primarySession: needsQuestion[0] ?? todaySessions[0],
      selectableSessions,
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
      selectableSessions: [],
    };
  }

  const nearestSessions = eligibleSessions.filter(
    (session) => session.date === nearestDate,
  );
  const needsQuestion = completedSessionIds
    ? nearestSessions.filter((session) => !completedSessionIds.has(session.id))
    : [];
  const selectableSessions = completedSessionIds
    ? [
        ...needsQuestion,
        ...nearestSessions.filter((session) => completedSessionIds.has(session.id)),
      ]
    : nearestSessions;

  return {
    kind: "upcoming",
    date: nearestDate,
    totalCount: nearestSessions.length,
    needsQuestionCount: completedSessionIds ? needsQuestion.length : null,
    primarySession: needsQuestion[0] ?? nearestSessions[0],
    selectableSessions,
  };
}
