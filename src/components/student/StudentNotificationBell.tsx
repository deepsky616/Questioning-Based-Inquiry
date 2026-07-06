"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("title")}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-indigo-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">{t("title")}</div>
        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {notifications.map((item) => {
              const content = (
                <>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{renderMessage(item)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{formatShortDateTime(item.createdAt)}</span>
                  </span>
                  {!item.readAt && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">{t("unread")}</span>}
                </>
              );

              return item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => markRead(item.id)}
                  className={`flex gap-2 px-3 py-2.5 hover:bg-muted ${item.readAt ? "opacity-75" : ""}`}
                >
                  {content}
                </Link>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => markRead(item.id)}
                  className={`flex w-full gap-2 px-3 py-2.5 text-left hover:bg-muted ${item.readAt ? "opacity-75" : ""}`}
                >
                  {content}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
