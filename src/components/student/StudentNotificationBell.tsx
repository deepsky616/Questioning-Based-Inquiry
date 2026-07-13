"use client";

import { MessageSquareText } from "lucide-react";
import { NotificationBellMenu, type NotificationMenuItem } from "@/components/shared/NotificationBellMenu";
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
  const { notifications, unreadCount, markRead, markAllRead } = useAppNotifications({
    queryKey: appNotificationQueryKeys.student,
  });

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
