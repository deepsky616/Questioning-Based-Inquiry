import { test, expect } from "@playwright/test";

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
    await page.getByRole("button", { name: /로그인/ }).click();
    await expect(page.locator("[aria-invalid='true'], .error, [role='alert']").first()).toBeVisible();
  });

  test("잘못된 자격증명으로 로그인 시 오류가 표시된다", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/이메일/).fill("wrong@email.com");
    await page.getByLabel(/비밀번호/).fill("wrongpassword");
    await page.getByRole("button", { name: /로그인/ }).click();
    await expect(
      page.getByText(/실패|오류|올바르지|잘못/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe("비밀번호 찾기 페이지", () => {
  test("비밀번호 찾기 링크가 로그인 페이지에 있다", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /비밀번호/i })).toBeVisible();
  });

  test("비밀번호 찾기 페이지로 이동된다", async ({ page }) => {
    await page.goto("/login");
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
