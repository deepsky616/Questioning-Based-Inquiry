"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import {
  NotificationBellMenu,
  type NotificationMenuItem,
  type NotificationMenuSection,
} from "@/components/shared/NotificationBellMenu";
import { useTranslations } from "next-intl";
import { formatShortDateTime } from "@/lib/datetime";
import {
  appNotificationQueryKeys,
  notificationMetadataText,
  type AppNotification,
  useAppNotifications,
} from "@/lib/app-notifications";

export function StudentNotificationBell() {
  const t = useTranslations("notify");
  const [open, setOpen] = useState(false);
  const notificationQuery = useAppNotifications({
    queryKey: appNotificationQueryKeys.student,
  });
  const { notifications, unreadCount, markRead, markAllRead } = notificationQuery;

  const renderMessage = (item: AppNotification) => {
    if (item.type === "SESSION_REMINDER") {
      const teacherName = notificationMetadataText(item.metadata, "teacherName");
      const sessionTitle = notificationMetadataText(item.metadata, "sessionTitle");
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
    meta: formatShortDateTime(
      item.type === "SESSION_REMINDER" && !item.readAt
        ? item.updatedAt ?? item.createdAt
        : item.createdAt,
    ),
    unread: !item.readAt,
    tone: "default",
    onClick: () => markRead(item.id),
  }));
  const sections: NotificationMenuSection[] = [{
    id: "saved",
    title: t("savedSection"),
    items,
    status: notificationQuery.isError
      ? "error"
      : notificationQuery.isLoading
        ? "loading"
        : "ready",
    loadingText: t("loading"),
    errorText: t("loadError"),
    emptyText: t("empty"),
    actionText: unreadCount > 0 ? t("markAllRead") : undefined,
    onAction: markAllRead,
    actionDisabled: unreadCount === 0,
  }];

  return (
    <NotificationBellMenu
      title={t("title")}
      emptyText={t("empty")}
      unreadText={t("unread")}
      count={unreadCount}
      sections={sections}
      open={open}
      onOpenChange={setOpen}
    />
  );
}
