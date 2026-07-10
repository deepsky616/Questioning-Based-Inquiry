import { expect, type Page } from "@playwright/test";
import type { StudentAskFlowFixture } from "./test-db";

/**
 * 하이드레이션 안전 학생 로그인.
 *
 * webkit(태블릿 프로젝트)에서는 dev 서버 첫 컴파일 동안 React 하이드레이션이
 * 늦어져, fill()이 하이드레이션 전에 실행되면 이후 상태 리셋으로 폼이 비워져
 * "모든 항목을 입력해 주세요"로 실패하는 경합이 있었다. 탭 전환이 실제로
 * 동작하는지(=React 핸들러가 붙었는지)를 재시도로 확인한 뒤에 입력한다.
 */
export async function loginAsStudent(page: Page, student: StudentAskFlowFixture["student"]): Promise<void> {
  await page.goto("/login");

  await expect(async () => {
    await page.getByRole("tab", { name: /교사/ }).click();
    await expect(page.locator("#t-email")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("tab", { name: /학생/ }).click();
  await expect(page.locator("#s-school")).toBeVisible();

  await page.locator("#s-school").fill(student.school);
  await page.locator("#s-grade").fill(student.grade);
  await page.locator("#s-class").fill(student.className);
  await page.locator("#s-number").fill(student.studentNumber);
  await page.locator("#s-password").fill(student.password);
  await page.getByRole("button", { name: "학생 로그인" }).click();
  await page.waitForURL("**/student-dashboard", { timeout: 20_000 });
  // 로그인 직후 잔여 내비게이션(router.push/refresh 중복)이 남아 다음 goto를
  // 가로채는 webkit 경합이 있다 — 대시보드가 완전히 정착할 때까지 기다린다.
  await page.waitForLoadState("networkidle").catch(() => {});
}
