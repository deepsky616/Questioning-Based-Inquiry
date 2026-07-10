/**
 * 학생 태블릿 핵심 이동 e2e.
 *
 * 검증 범위: 학생 로그인 후 태블릿 크기에서 대시보드, 질문 작성,
 * 내 질문, 질문 놀이 화면으로 이동해 주요 화면이 깨지지 않고 열린다.
 */
import { test, expect } from "@playwright/test";
import {
  cleanupStudentAskFlow,
  prepareStudentAskFlow,
  type StudentAskFlowFixture,
} from "./helpers/test-db";
import { loginAsStudent } from "./helpers/login";

test.describe("학생 태블릿 핵심 이동", () => {
  test.setTimeout(120_000);

  let fixture: StudentAskFlowFixture;

  // 스펙×프로젝트별로 학생·세션을 분리해 병렬 실행 경합을 막는다
  test.beforeAll(async ({}, testInfo) => {
    fixture = await prepareStudentAskFlow(`nav-${testInfo.project.name}`);
  });

  test.afterAll(async ({}, testInfo) => {
    await cleanupStudentAskFlow(`nav-${testInfo.project.name}`);
  });

  test("학생이 태블릿에서 주요 학생 화면을 순서대로 열 수 있다", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });

    await loginAsStudent(page, fixture.student);
    await expect(page.getByText(/내 포인트|내가 할 일/).first()).toBeVisible({ timeout: 15000 });

    // webkit에서 연속 이동 중 세션 조회가 끊기면 /login으로 튕기는 경합이 있다.
    // 이동이 가로채여도 무시하고, /login에 떨어졌으면 재로그인한 뒤 다시 시도한다.
    const gotoAndSee = async (path: string, locator: () => ReturnType<typeof page.locator> | ReturnType<typeof page.getByRole>) => {
      await expect(async () => {
        await page.goto(path).catch(() => {});
        if (page.url().includes("/login")) {
          await loginAsStudent(page, fixture.student);
          await page.goto(path);
        }
        await expect(locator()).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 45000 });
    };

    await gotoAndSee(`/student-ask?sessionId=${fixture.session.id}`, () => page.locator("#content"));

    // 내비 링크 텍스트는 좁은 화면에서 숨겨질 수 있으므로 페이지 제목(헤딩)으로 확인한다
    await gotoAndSee("/student-questions", () => page.getByRole("heading", { name: /질문탐구/ }));
    await gotoAndSee("/student-question-play", () => page.getByRole("heading", { name: /질문놀이/ }));
  });
});
