import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  type NotificationResponse,
  updateAllNotificationsReadCache,
  updateNotificationReadCache,
} from "@/lib/app-notifications";

const queryKey = ["student-notifications"] as const;

describe("알림 공용 캐시", () => {
  it("화면 표시 상한 밖의 수업 요청도 읽으면 전체 안 읽은 수를 바로 줄인다", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<NotificationResponse>(queryKey, {
      notifications: [],
      unreadCount: 3,
      unreadSessionReminders: [
        { id: "hidden-reminder", sessionId: "session-1", href: "/student-ask" },
      ],
    });

    updateNotificationReadCache(queryClient, queryKey, "hidden-reminder");

    expect(queryClient.getQueryData<NotificationResponse>(queryKey)).toMatchObject({
      unreadCount: 2,
      unreadSessionReminders: [],
    });
  });

  it("모두 읽기는 수업 요청 집계 자료도 함께 비운다", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<NotificationResponse>(queryKey, {
      notifications: [],
      unreadCount: 1,
      unreadSessionReminders: [
        { id: "reminder", sessionId: "session-1", href: "/student-ask" },
      ],
    });

    updateAllNotificationsReadCache(queryClient, queryKey);

    expect(queryClient.getQueryData<NotificationResponse>(queryKey)).toMatchObject({
      unreadCount: 0,
      unreadSessionReminders: [],
    });
  });
});
