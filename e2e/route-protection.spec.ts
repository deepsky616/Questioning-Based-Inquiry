import { test, expect } from "@playwright/test";

/**
 * 미인증 사용자의 보호 라우트/ API 접근을 검증한다.
 * 로그인(=DB 시드)이 필요 없는 시나리오만 다루므로 dev 서버만 떠 있으면 통과한다.
 */

test.describe("페이지 라우트 보호 (미인증 → /login)", () => {
  const protectedPages = [
    "/teacher-dashboard",
    "/teacher-question-learning",
    "/teacher-questions",
    "/teacher-sessions",
    "/teacher-students",
    "/student-dashboard",
    "/student-question-learning",
    "/student-ask",
    "/student-questions",
    "/student-report",
  ];

  for (const path of protectedPages) {
    test(`미인증 상태에서 ${path} 접근 시 로그인으로 리다이렉트`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/login/);
    });
  }
});

test.describe("API 라우트 보호 (미인증 → 401)", () => {
  test("GET /api/questions 는 401", async ({ request }) => {
    const res = await request.get("/api/questions");
    expect(res.status()).toBe(401);
  });

  test("GET /api/sessions 는 401", async ({ request }) => {
    const res = await request.get("/api/sessions");
    expect(res.status()).toBe(401);
  });

  test("GET /api/stats 는 401", async ({ request }) => {
    const res = await request.get("/api/stats");
    expect(res.status()).toBe(401);
  });

  // 회귀 테스트: /api/classify 인증 게이트 (PR #3에서 추가)
  test("POST /api/classify 는 미인증 시 401 (익명 Gemini 호출 차단)", async ({ request }) => {
    const res = await request.post("/api/classify", {
      data: { content: "광합성은 왜 일어날까요?" },
    });
    expect(res.status()).toBe(401);
  });
});
