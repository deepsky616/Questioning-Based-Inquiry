import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTeacherFlaggedCount,
  fetchTeacherPendingPointCount,
  teacherAlertQueryOptions,
  teacherAlertQueryKeys,
} from "@/lib/teacher-alert-counts";
import { APP_NOTIFICATION_POLL_MS } from "@/lib/query-refresh";

const root = process.cwd();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("교사 중요 수 공용 조회", () => {
  it("알림과 대시보드가 함께 쓸 고정 조회 이름을 제공한다", () => {
    expect(teacherAlertQueryKeys.flagged).toEqual(["teacher-alert-counts", "flagged"]);
    expect(teacherAlertQueryKeys.pendingPoints).toEqual([
      "teacher-alert-counts",
      "pending-points",
    ]);
  });

  it("서버 원본 응답 모양을 유지해 같은 캐시에 다른 자료형을 섞지 않는다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total: 3, questions: 2, comments: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 4 }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTeacherFlaggedCount()).resolves.toEqual({
      total: 3,
      questions: 2,
      comments: 1,
    });
    await expect(fetchTeacherPendingPointCount()).resolves.toEqual({ count: 4 });
  });

  it("조회 실패를 0으로 숨기지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(fetchTeacherPendingPointCount()).rejects.toThrow();
  });

  it("대시보드 밖에서도 기존 알림 조회 주기를 유지한다", () => {
    expect(teacherAlertQueryOptions.flagged().refetchInterval()).toBe(
      APP_NOTIFICATION_POLL_MS,
    );
  });

  it("교사 화면과 처리 동작이 예전의 서로 다른 조회 이름을 쓰지 않는다", () => {
    const files = [
      "src/app/(teacher)/teacher-dashboard/page.tsx",
      "src/components/teacher/NotificationBell.tsx",
      "src/components/teacher/point-review/usePointReview.ts",
      "src/app/(teacher)/teacher-questions/page.tsx",
      "src/components/shared/CommentThread.tsx",
    ];
    const source = files
      .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
      .join("\n");

    expect(source).not.toContain('["flagged-count"]');
    expect(source).not.toContain('["pending-review-count"]');
    expect(source).not.toContain('["teacher-flagged-count"]');
    expect(source).not.toContain('["teacher-pending-point-count"]');
    expect(source).toContain("teacherAlertQueryKeys.flagged");
    expect(source).toContain("teacherAlertQueryKeys.pendingPoints");
  });
});
