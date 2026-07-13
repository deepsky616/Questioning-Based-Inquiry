"use client";

import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { APP_NOTIFICATION_POLL_MS, visibleRefetchInterval } from "@/lib/query-refresh";

export { APP_NOTIFICATION_POLL_MS };

export const appNotificationQueryKeys = {
  student: ["student-notifications"] as const,
  teacher: ["teacher-app-notifications"] as const,
};

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  sessionId: string | null;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface NotificationResponse {
  notifications: AppNotification[];
  unreadCount: number;
  unreadSessionReminders?: Array<{
    id: string;
    sessionId: string | null;
    href: string | null;
  }>;
}

export function notificationMetadataText(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== "object") return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export async function fetchAppNotifications(): Promise<NotificationResponse> {
  const res = await fetch("/api/notifications");
  if (!res.ok) throw new Error("notifications failed");
  return res.json();
}

function markOneRead(prev: NotificationResponse | undefined, id: string): NotificationResponse | undefined {
  if (!prev) return prev;
  const now = new Date().toISOString();
  const wasUnread =
    prev.notifications.some((item) => item.id === id && !item.readAt) ||
    prev.unreadSessionReminders?.some((item) => item.id === id) === true;

  return {
    unreadCount: wasUnread ? Math.max(0, prev.unreadCount - 1) : prev.unreadCount,
    notifications: prev.notifications.map((item) =>
      item.id === id ? { ...item, readAt: item.readAt ?? now } : item,
    ),
    unreadSessionReminders: prev.unreadSessionReminders?.filter((item) => item.id !== id),
  };
}

function markEveryRead(prev: NotificationResponse | undefined): NotificationResponse | undefined {
  if (!prev) return prev;
  const now = new Date().toISOString();

  return {
    unreadCount: 0,
    notifications: prev.notifications.map((item) => ({
      ...item,
      readAt: item.readAt ?? now,
    })),
    unreadSessionReminders: [],
  };
}

async function markReadRequest(id: string) {
  const res = await fetch(`/api/notifications/${id}`, { method: "PATCH" });
  if (!res.ok) throw new Error("notification read failed");
}

async function markAllReadRequest() {
  const res = await fetch("/api/notifications", { method: "PATCH" });
  if (!res.ok) throw new Error("notifications read failed");
}

export function updateNotificationReadCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  id: string,
) {
  queryClient.setQueryData<NotificationResponse>(queryKey, (prev) => markOneRead(prev, id));
}

export function updateAllNotificationsReadCache(queryClient: QueryClient, queryKey: QueryKey) {
  queryClient.setQueryData<NotificationResponse>(queryKey, markEveryRead);
}

export function useAppNotifications({
  queryKey,
  enabled = true,
  refetchInterval = APP_NOTIFICATION_POLL_MS,
}: {
  queryKey: QueryKey;
  enabled?: boolean;
  refetchInterval?: number;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: fetchAppNotifications,
    enabled,
    refetchInterval: () => visibleRefetchInterval(refetchInterval),
    refetchOnWindowFocus: true,
  });

  const markRead = async (id: string) => {
    updateNotificationReadCache(queryClient, queryKey, id);
    try {
      await markReadRequest(id);
    } catch {
      await queryClient.invalidateQueries({ queryKey });
    }
  };

  const markAllRead = async () => {
    updateAllNotificationsReadCache(queryClient, queryKey);
    try {
      await markAllReadRequest();
    } catch {
      await queryClient.invalidateQueries({ queryKey });
    }
  };

  return {
    ...query,
    notifications: query.data?.notifications ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    unreadSessionReminders: query.data?.unreadSessionReminders ?? [],
    markRead,
    markAllRead,
  };
}
