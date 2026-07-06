"use client";

import { MessageSquareText } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NotificationBellMenu, type NotificationMenuItem } from "@/components/shared/NotificationBellMenu";
import { useTranslations } from "next-intl";
import { formatShortDateTime } from "@/lib/datetime";

const POLL_MS = 25000;

interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
}

interface NotificationResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

function metadataText(metadata: unknown, key: "teacherName" | "sessionTitle"): string {
  if (!metadata || typeof metadata !== "object") return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

async function fetchNotifications(): Promise<NotificationResponse> {
  const res = await fetch("/api/notifications");
  if (!res.ok) throw new Error("notifications failed");
  return res.json();
}

export function StudentNotificationBell() {
  const t = useTranslations("notify");
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["student-notifications"],
    queryFn: fetchNotifications,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const markRead = async (id: string) => {
    queryClient.setQueryData<NotificationResponse>(["student-notifications"], (prev) => {
      if (!prev) return prev;
      const wasUnread = prev.notifications.some((item) => item.id === id && !item.readAt);
      return {
        unreadCount: wasUnread ? Math.max(0, prev.unreadCount - 1) : prev.unreadCount,
        notifications: prev.notifications.map((item) =>
          item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item,
        ),
      };
    });
    await fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => null);
  };
  const markAllRead = async () => {
    queryClient.setQueryData<NotificationResponse>(["student-notifications"], (prev) => {
      if (!prev) return prev;
      return {
        unreadCount: 0,
        notifications: prev.notifications.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      };
    });
    await fetch("/api/notifications", { method: "PATCH" }).catch(() => null);
  };

  const renderMessage = (item: AppNotification) => {
    if (item.type === "SESSION_REMINDER") {
      const teacherName = metadataText(item.metadata, "teacherName");
      const sessionTitle = metadataText(item.metadata, "sessionTitle");
      if (teacherName && sessionTitle) {
        return t("sessionReminderItem", { teacherName, sessionTitle });
      }
    }
    return item.message || item.title;
  };
  const items: NotificationMenuItem[] = notifications.map((item) => ({
    id: item.id,
    href: item.href,
    label: renderMessage(item),
    icon: <MessageSquareText className="h-4 w-4 text-indigo-500" />,
    meta: formatShortDateTime(item.createdAt),
    unread: !item.readAt,
    tone: "default",
    onClick: () => markRead(item.id),
  }));

  return (
    <NotificationBellMenu
      title={t("title")}
      emptyText={t("empty")}
      unreadText={t("unread")}
      count={unreadCount}
      items={items}
      actionText={unreadCount > 0 ? t("markAllRead") : undefined}
      onAction={markAllRead}
      actionDisabled={unreadCount === 0}
    />
  );
}
