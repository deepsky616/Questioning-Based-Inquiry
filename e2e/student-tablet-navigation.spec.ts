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

test.describe("학생 태블릿 핵심 이동", () => {
  test.setTimeout(120_000);

  let fixture: StudentAskFlowFixture;

  test.beforeAll(async () => {
    fixture = await prepareStudentAskFlow();
  });

  test.afterAll(async () => {
    await cleanupStudentAskFlow();
  });

  test("학생이 태블릿에서 주요 학생 화면을 순서대로 열 수 있다", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });

    await page.goto("/login");
    await page.locator("#s-school").fill(fixture.student.school);
    await page.locator("#s-grade").fill(fixture.student.grade);
    await page.locator("#s-class").fill(fixture.student.className);
    await page.locator("#s-number").fill(fixture.student.studentNumber);
    await page.locator("#s-password").fill(fixture.student.password);
    await page.getByRole("button", { name: "학생 로그인" }).click();
    await page.waitForURL("**/student-dashboard", { timeout: 15000 });
    await expect(page.getByText(/내 포인트|내가 할 일/).first()).toBeVisible({ timeout: 15000 });

    await page.goto(`/student-ask?sessionId=${fixture.session.id}`);
    await expect(page.locator("#content")).toBeVisible({ timeout: 15000 });

    await page.goto("/student-questions");
    await expect(page.getByText(/내 질문|질문/).first()).toBeVisible({ timeout: 15000 });

    await page.goto("/student-question-play");
    await expect(page.getByText(/질문 놀이|놀이/).first()).toBeVisible({ timeout: 15000 });
  });
});
