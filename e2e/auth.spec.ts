import { test, expect, type Page } from "@playwright/test";

// dev 서버 첫 컴파일 동안 하이드레이션이 늦어 클릭이 유실되는 경합 방지
// (e2e/helpers/login.ts와 같은 패턴) — 탭 전환이 실제로 동작하는지 재시도로
// 확인해 React 핸들러가 붙었음을 보장한 뒤에 상호작용한다.
async function openTeacherTab(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByRole("tab", { name: /교사/ }).click();
    await expect(page.locator("#t-email")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("로그인 페이지", () => {
  test("로그인 페이지가 정상적으로 렌더링된다", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/Question Lab/);
  });

  test("교사 탭과 학생 탭이 존재한다", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("tab", { name: /교사/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /학생/ })).toBeVisible();
  });

  test("빈 폼 제출 시 오류 메시지가 표시된다", async ({ page }) => {
    await page.goto("/login");
    // 하이드레이션 완료 확인 후 기본(학생) 탭으로 돌아와 빈 폼을 제출한다
    await openTeacherTab(page);
    await page.getByRole("tab", { name: /학생/ }).click();
    await expect(page.locator("#s-school")).toBeVisible();
    await page.getByRole("button", { name: /로그인/ }).click();
    await expect(page.locator("[aria-invalid='true'], .error, [role='alert']").first()).toBeVisible();
  });

  test("잘못된 자격증명으로 로그인 시 오류가 표시된다", async ({ page }) => {
    await page.goto("/login");
    await openTeacherTab(page);
    // 비밀번호 보기 버튼(aria-label에 '비밀번호' 포함)과의 충돌을 피해 id로 지정
    await page.locator("#t-email").fill("wrong@email.com");
    await page.locator("#t-password").fill("wrongpassword");
    await page.getByRole("button", { name: /로그인/ }).click();
    await expect(
      page.getByText(/실패|오류|올바르지|잘못/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("비밀번호 찾기 페이지", () => {
  test("비밀번호 찾기 링크가 교사 로그인 탭에 있다", async ({ page }) => {
    await page.goto("/login");
    await openTeacherTab(page);
    await expect(page.getByRole("link", { name: /비밀번호/i })).toBeVisible();
  });

  test("비밀번호 찾기 페이지로 이동된다", async ({ page }) => {
    await page.goto("/login");
    await openTeacherTab(page);
    await page.getByRole("link", { name: /비밀번호/i }).click();
    await expect(page).toHaveURL(/forgot-password/);
  });
});

test.describe("라우트 보호", () => {
  test("미인증 상태에서 teacher-dashboard 접근 시 로그인으로 리다이렉트된다", async ({ page }) => {
    await page.goto("/teacher-dashboard");
    await expect(page).toHaveURL(/login/);
  });

  test("미인증 상태에서 student-dashboard 접근 시 로그인으로 리다이렉트된다", async ({ page }) => {
    await page.goto("/student-dashboard");
    await expect(page).toHaveURL(/login/);
  });
});
