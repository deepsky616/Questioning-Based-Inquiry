"use client";

import { useQuery } from "@tanstack/react-query";
import { sortSessionsAsc } from "@/lib/sessions";

export const APP_DATA_REFETCH_MS = 12000;

export const appQueryKeys = {
  teacherSessions: ["teacher-sessions"] as const,
  teacherStudents: ["teacher-students"] as const,
  studentSessions: (userId: string) => ["student-sessions", userId] as const,
};

export interface BasicSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
}

export interface TeacherStudentListResponse<TStudent, TClass> {
  students: TStudent[];
  teacherClasses: TClass[];
}

async function fetchSessions<TSession extends BasicSession>(): Promise<TSession[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error("failed to load sessions");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchTeacherStudents<TStudent, TClass>(): Promise<TeacherStudentListResponse<TStudent, TClass>> {
  const res = await fetch("/api/teacher/students");
  if (!res.ok) throw new Error("failed to load students");
  const data = await res.json();
  return {
    students: Array.isArray(data?.students) ? data.students : [],
    teacherClasses: Array.isArray(data?.teacherClasses) ? data.teacherClasses : [],
  };
}

export function useTeacherSessions<TSession extends BasicSession>() {
  return useQuery<TSession[]>({
    queryKey: appQueryKeys.teacherSessions,
    queryFn: async () => sortSessionsAsc(await fetchSessions<TSession>()),
    refetchInterval: APP_DATA_REFETCH_MS,
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
    queryFn: () => fetchSessions<TSession>(),
    enabled: enabled && Boolean(userId),
    refetchInterval: APP_DATA_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}

export function useTeacherStudents<TStudent, TClass>() {
  return useQuery<TeacherStudentListResponse<TStudent, TClass>>({
    queryKey: appQueryKeys.teacherStudents,
    queryFn: fetchTeacherStudents<TStudent, TClass>,
    refetchInterval: APP_DATA_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}
