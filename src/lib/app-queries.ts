"use client";

import { useQuery } from "@tanstack/react-query";
import { sortSessionsDesc } from "@/lib/sessions";
import {
  visibleDataRefetchInterval,
  visibleNotificationRefetchInterval,
} from "@/lib/query-refresh";
import { localDateKey } from "@/lib/dashboard-question-class-schedule";

export const appQueryKeys = {
  teacherSessions: ["teacher-sessions"] as const,
  teacherDashboardSchedule: ["teacher-sessions", "dashboard-schedule"] as const,
  teacherStudents: ["teacher-students"] as const,
  studentSessions: (userId: string) => ["student-sessions", userId] as const,
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

async function fetchSessions<TSession extends BasicSession>(href = "/api/sessions"): Promise<TSession[]> {
  const res = await fetch(href);
  if (!res.ok) throw new Error("질문수업을 불러오지 못했습니다");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchTeacherStudents<TStudent, TClass>(): Promise<TeacherStudentListResponse<TStudent, TClass>> {
  const params = new URLSearchParams({ today: localDateKey() });
  const res = await fetch(`/api/teacher/students?${params}`);
  if (!res.ok) throw new Error("학생 목록을 불러오지 못했습니다");
  const data = await res.json();
  return {
    students: Array.isArray(data?.students) ? data.students : [],
    teacherClasses: Array.isArray(data?.teacherClasses) ? data.teacherClasses : [],
  };
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

export function useTeacherStudents<TStudent, TClass>() {
  return useQuery<TeacherStudentListResponse<TStudent, TClass>>({
    queryKey: appQueryKeys.teacherStudents,
    queryFn: fetchTeacherStudents<TStudent, TClass>,
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
}
