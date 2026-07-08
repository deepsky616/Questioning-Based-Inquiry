import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APP_DATA_REFETCH_MS,
  APP_NOTIFICATION_POLL_MS,
  APP_REPORT_REFETCH_MS,
  visibleRefetchInterval,
} from "@/lib/query-refresh";

describe("공통 폴링 정책", () => {
  it("기본 데이터, 알림, 리포트 주기를 한 곳에서 관리한다", () => {
    expect(APP_DATA_REFETCH_MS).toBe(12000);
    expect(APP_NOTIFICATION_POLL_MS).toBe(25000);
    expect(APP_REPORT_REFETCH_MS).toBe(60000);
  });

  it("화면이 보일 때만 폴링 주기를 반환한다", () => {
    expect(visibleRefetchInterval(12000, "visible")).toBe(12000);
    expect(visibleRefetchInterval(12000, "hidden")).toBe(false);
  });

  it("주요 화면에서 숫자 폴링 값을 직접 쓰지 않는다", () => {
    const files = [
      "src/app/(student)/student-dashboard/page.tsx",
      "src/app/(teacher)/teacher-dashboard/page.tsx",
      "src/app/(teacher)/teacher-questions/page.tsx",
      "src/app/(teacher)/teacher-students/page.tsx",
      "src/app/(teacher)/teacher-curriculum/page.tsx",
      "src/components/student/UnitDesignView.tsx",
      "src/components/student/MyQuestionsView.tsx",
      "src/components/student/ExploreQuestionsView.tsx",
      "src/components/shared/RankingPanels.tsx",
      "src/components/shared/PointsCard.tsx",
      "src/components/teacher/NotificationBell.tsx",
      "src/components/teacher/TeacherReportsView.tsx",
      "src/components/reports/StudentReportView.tsx",
    ];

    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return [
        /refetchInterval:\s*(12000|25000|60000)/,
        /setInterval\(refetch,\s*12000\)/,
        /const POLL_MS = (12000|25000)/,
      ]
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${file}: ${pattern}`);
    });

    expect(offenders).toEqual([]);
  });
});
