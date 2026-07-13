"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, MessageSquareText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  NotificationBellMenu,
  type NotificationMenuItem,
  type NotificationMenuSection,
} from "@/components/shared/NotificationBellMenu";
import { useTranslations } from "next-intl";
import { formatShortDateTime } from "@/lib/datetime";
import { appNotificationQueryKeys, useAppNotifications } from "@/lib/app-notifications";
import { APP_NOTIFICATION_POLL_MS } from "@/lib/query-refresh";
import { teacherAlertQueryOptions } from "@/lib/teacher-alert-counts";

/**
 * 배지는 읽지 않은 저장 알림만 세고, 별도 검토 항목은 메뉴에서 늘 바로 갈 수 있게 한다.
 */
export function NotificationBell() {
  const t = useTranslations("notify");
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const prevRef = useRef<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flaggedQuery = useQuery(teacherAlertQueryOptions.flagged());
  const pendingQuery = useQuery(teacherAlertQueryOptions.pendingPoints());
  const notificationQuery = useAppNotifications({
    queryKey: appNotificationQueryKeys.teacher,
    refetchInterval: APP_NOTIFICATION_POLL_MS,
  });
  const {
    notifications: savedNotifications,
    unreadCount: unreadSavedCount,
    markRead,
    markAllRead,
  } = notificationQuery;

  const flaggedCount = flaggedQuery.data?.total;
  const pendingCount = pendingQuery.data?.count;

  const calculatedItems: NotificationMenuItem[] = [
    {
      id: "flagged",
      href: "/teacher-questions?flagged=1",
      label: t.rich("flaggedItem", { b: (c) => <b className="font-semibold text-red-600">{c}</b> }),
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
      count: flaggedCount,
      tone: "danger",
    },
    {
      id: "pending",
      href: "/teacher-points?tab=points",
      label: t.rich("pendingItem", { b: (c) => <b className="font-semibold text-amber-600">{c}</b> }),
      icon: <ClipboardCheck className="h-4 w-4 text-amber-500" />,
      count: pendingCount,
      tone: "warning",
    },
  ];
  const savedItems: NotificationMenuItem[] = savedNotifications.map((item) => ({
    id: item.id,
    href: item.href,
    label: item.message || item.title,
    icon: <MessageSquareText className="h-4 w-4 text-indigo-500" />,
    meta: formatShortDateTime(item.createdAt),
    unread: !item.readAt,
    tone: "default",
    onClick: () => markRead(item.id),
  }));
  const taskStatus = flaggedQuery.isError || pendingQuery.isError
    ? "error"
    : flaggedQuery.isLoading || pendingQuery.isLoading
      ? "loading"
      : "ready";
  const savedStatus = notificationQuery.isError
    ? "error"
    : notificationQuery.isLoading
      ? "loading"
      : "ready";
  const sections: NotificationMenuSection[] = [
    {
      id: "tasks",
      title: t("tasksSection"),
      items: calculatedItems,
      status: taskStatus,
      loadingText: t("taskLoading"),
      errorText: t("taskLoadError"),
    },
    {
      id: "saved",
      title: t("savedSection"),
      items: savedItems,
      status: savedStatus,
      loadingText: t("loading"),
      errorText: t("loadError"),
      emptyText: t("empty"),
      actionText: unreadSavedCount > 0 ? t("markAllRead") : undefined,
      onAction: markAllRead,
      actionDisabled: unreadSavedCount === 0,
    },
  ];

  // 부적절 의심이 늘면 토스트로 알림(첫 응답은 기준값만)
  useEffect(() => {
    if (flaggedQuery.data === undefined) return;
    if (prevRef.current !== null && flaggedQuery.data.total > prevRef.current) {
      const added = flaggedQuery.data.total - prevRef.current;
      setToast(t("newFlagged", { added }));
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 6000);
    }
    prevRef.current = flaggedQuery.data.total;
  }, [flaggedQuery.data, t]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  return (
    <>
      <NotificationBellMenu
        title={t("title")}
        emptyText={t("empty")}
        unreadText={t("unread")}
        count={unreadSavedCount}
        sections={sections}
        open={open}
        onOpenChange={setOpen}
      />

      {toast && (
        <Link
          href="/teacher-questions?flagged=1"
          onClick={() => setToast(null)}
          className="fixed bottom-5 right-5 z-50 block max-w-xs rounded-xl border border-red-200 bg-card px-4 py-3 text-left text-sm shadow-lg dark:border-red-500/40"
        >
          <p className="font-semibold text-red-600">{toast}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("tapToView")}</p>
        </Link>
      )}
    </>
  );
}
