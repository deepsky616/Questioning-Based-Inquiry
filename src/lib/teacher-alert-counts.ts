import { visibleNotificationRefetchInterval } from "@/lib/query-refresh";

export interface TeacherFlaggedCount {
  total: number;
  questions: number;
  comments: number;
}

export interface TeacherPendingPointCount {
  count: number;
}

export const teacherAlertQueryKeys = {
  flagged: ["teacher-alert-counts", "flagged"] as const,
  pendingPoints: ["teacher-alert-counts", "pending-points"] as const,
};

export async function fetchTeacherFlaggedCount(): Promise<TeacherFlaggedCount> {
  const response = await fetch("/api/teacher/flagged-count");
  if (!response.ok) throw new Error("교사 중요 항목을 불러오지 못했습니다");
  return response.json();
}

export async function fetchTeacherPendingPointCount(): Promise<TeacherPendingPointCount> {
  const response = await fetch("/api/teacher/points/pending-count");
  if (!response.ok) throw new Error("교사 중요 항목을 불러오지 못했습니다");
  return response.json();
}

export const teacherAlertQueryOptions = {
  flagged: () => ({
    queryKey: teacherAlertQueryKeys.flagged,
    queryFn: fetchTeacherFlaggedCount,
    refetchInterval: visibleNotificationRefetchInterval,
    refetchOnWindowFocus: true,
  }),
  pendingPoints: () => ({
    queryKey: teacherAlertQueryKeys.pendingPoints,
    queryFn: fetchTeacherPendingPointCount,
    refetchInterval: visibleNotificationRefetchInterval,
    refetchOnWindowFocus: true,
  }),
};
