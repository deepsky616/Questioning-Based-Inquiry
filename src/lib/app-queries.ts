"use client";

import { useQuery } from "@tanstack/react-query";
import { sortSessionsDesc } from "@/lib/sessions";
import {
  visibleDataRefetchInterval,
  visibleNotificationRefetchInterval,
  visibleReportRefetchInterval,
} from "@/lib/query-refresh";
import { useLocalDateKey } from "@/lib/use-local-date-key";

export const appQueryKeys = {
  teacherSessions: ["teacher-sessions"] as const,
  teacherDashboardSchedule: ["teacher-sessions", "dashboard-schedule"] as const,
  teacherStudents: ["teacher-students"] as const,
  teacherStudentDirectory: ["teacher-students", "directory"] as const,
  teacherStudentActivity: (today: string) => ["teacher-students", "activity", today] as const,
  studentSessions: (userId: string) => ["student-sessions", userId] as const,
  studentQuestionSummary: (userId: string) => ["student-question-summary", userId] as const,
  studentSessionQuestion: (userId: string, sessionId: string) =>
    ["student-session-question", userId, sessionId] as const,
};

export interface BasicSession {
  id: string;
  date: string;
  createdAt?: string | Date | null;
  subject: string;
  topic: string;
}

export interface TeacherStudentListResponse<TStudent, TClass> {
  students: TStudent[];
  teacherClasses: TClass[];
}

export interface TeacherStudentActivity {
  studentId: string;
  questionCount: number;
  commentCount: number;
  totalPoints: number;
  lastActivityAt: string | null;
  sessionProgress: {
    total: number;
    completed: number;
    remaining: number;
    percent: number;
    actionableRemaining: number;
  };
}

export interface TeacherStudentActivityResponse {
  activity: TeacherStudentActivity[];
}

export interface StudentQuestionSummary {
  recent: Array<{
    id: string;
    content: string;
    closure: string;
    cognitive: string;
    createdAt: string;
  }>;
  stats: {
    total: number;
    byClosure: { closed: number; open: number };
    byCognitive: { factual: number; conceptual: number; controversial: number };
  };
  answeredSessionIds: string[];
}

export interface StudentSessionQuestionResponse {
  existingQuestion: { id: string; content: string } | null;
}

async function fetchSessions<TSession extends BasicSession>(href = "/api/sessions"): Promise<TSession[]> {
  const res = await fetch(href);
  if (!res.ok) throw new Error("질문수업을 불러오지 못했습니다");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchTeacherStudentDirectory<TStudent, TClass>(): Promise<TeacherStudentListResponse<TStudent, TClass>> {
  const res = await fetch("/api/teacher/students?view=directory");
  if (!res.ok) throw new Error("학생 목록을 불러오지 못했습니다");
  const data = await res.json();
  return {
    students: Array.isArray(data?.students) ? data.students : [],
    teacherClasses: Array.isArray(data?.teacherClasses) ? data.teacherClasses : [],
  };
}

async function fetchTeacherStudentActivity(today: string): Promise<TeacherStudentActivityResponse> {
  const params = new URLSearchParams({ view: "activity", today });
  const res = await fetch(`/api/teacher/students?${params}`);
  if (!res.ok) throw new Error("학생 활동을 불러오지 못했습니다");
  const data = await res.json();
  return { activity: Array.isArray(data?.activity) ? data.activity : [] };
}

export function mergeTeacherStudentActivity<TStudent extends { id: string }>(
  students: TStudent[],
  activity: TeacherStudentActivity[],
): Array<TStudent & Omit<TeacherStudentActivity, "studentId">> {
  const activityByStudent = new Map(activity.map((item) => [item.studentId, item]));
  return students.map((student) => {
    const item = activityByStudent.get(student.id);
    return {
      ...student,
      questionCount: item?.questionCount ?? 0,
      commentCount: item?.commentCount ?? 0,
      totalPoints: item?.totalPoints ?? 0,
      lastActivityAt: item?.lastActivityAt ?? null,
      sessionProgress: item?.sessionProgress ?? {
        total: 0,
        completed: 0,
        remaining: 0,
        percent: 0,
        actionableRemaining: 0,
      },
    };
  });
}

export function useTeacherSessions<TSession extends BasicSession>() {
  return useQuery<TSession[]>({
    queryKey: appQueryKeys.teacherSessions,
    queryFn: async () => sortSessionsDesc(await fetchSessions<TSession>()),
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
}

export function useTeacherDashboardSchedule<TSession extends BasicSession>() {
  return useQuery<TSession[]>({
    queryKey: appQueryKeys.teacherDashboardSchedule,
    queryFn: async () =>
      sortSessionsDesc(await fetchSessions<TSession>("/api/sessions?view=schedule")),
    refetchInterval: visibleNotificationRefetchInterval,
    refetchOnWindowFocus: true,
  });
}

export function useStudentSessions<TSession extends BasicSession>({
  userId,
  enabled = true,
}: {
  userId: string;
  enabled?: boolean;
}) {
  return useQuery<TSession[]>({
    queryKey: appQueryKeys.studentSessions(userId),
    queryFn: async () => sortSessionsDesc(await fetchSessions<TSession>()),
    enabled: enabled && Boolean(userId),
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
}

export function useStudentQuestionSummary({
  userId,
  enabled = true,
}: {
  userId: string;
  enabled?: boolean;
}) {
  return useQuery<StudentQuestionSummary>({
    queryKey: appQueryKeys.studentQuestionSummary(userId),
    queryFn: async () => {
      const res = await fetch("/api/questions?view=dashboard");
      if (!res.ok) throw new Error("질문 요약을 불러오지 못했습니다");
      return res.json();
    },
    enabled: enabled && Boolean(userId),
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
}

export function useStudentSessionQuestion({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}) {
  return useQuery<StudentSessionQuestionResponse>({
    queryKey: appQueryKeys.studentSessionQuestion(userId, sessionId),
    queryFn: async () => {
      const params = new URLSearchParams({ view: "student-session", sessionId });
      const res = await fetch(`/api/questions?${params}`);
      if (!res.ok) throw new Error("작성한 질문을 불러오지 못했습니다");
      return res.json();
    },
    enabled: Boolean(userId && sessionId),
    refetchOnWindowFocus: true,
  });
}

export function useTeacherStudentDirectory<TStudent, TClass>() {
  return useQuery<TeacherStudentListResponse<TStudent, TClass>>({
    queryKey: appQueryKeys.teacherStudentDirectory,
    queryFn: fetchTeacherStudentDirectory<TStudent, TClass>,
    refetchInterval: visibleReportRefetchInterval,
    refetchOnWindowFocus: true,
  });
}

export function useTeacherStudentActivity({ today }: { today?: string } = {}) {
  const currentDateKey = useLocalDateKey();
  const queryToday = today ?? currentDateKey;
  return useQuery<TeacherStudentActivityResponse>({
    queryKey: appQueryKeys.teacherStudentActivity(queryToday),
    queryFn: () => fetchTeacherStudentActivity(queryToday),
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
}

export function useTeacherStudents<TStudent, TClass>() {
  return useTeacherStudentDirectory<TStudent, TClass>();
}
