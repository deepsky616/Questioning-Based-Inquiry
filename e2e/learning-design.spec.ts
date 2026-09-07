import { expect, test } from "@playwright/test";
import { preparePage } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow, expectTextContrast } from "./helpers/question-game-room";
import { BUILT_IN_GAMES } from "../src/lib/question-games-data";

// 실제 화면과 상호작용을 검증하며 시험용 조회 응답으로 운영 자료 변경을 피한다.
for (const width of [375, 768, 1440]) {
  for (const role of ["STUDENT", "TEACHER"] as const) {
    test(`${role === "STUDENT" ? "학생" : "교사"} ${width}픽셀에서 글씨·메뉴·안내가 겹치지 않는다`, async ({ page, baseURL }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const { errors } = await preparePage(page, role, baseURL!);
      await page.route("**/api/teacher/students**", (route) => route.fulfill({ json: { students: [], teacherClasses: [] } }));
      await page.goto(role === "STUDENT" ? "/student-ask?sessionId=filter-weather" : "/teacher-sessions");
      await expect(page.locator("main")).toBeVisible();

      if (role === "STUDENT") {
        const input = page.getByLabel("질문", { exact: true });
        await expect(input).toBeVisible();
        await expect(input).toHaveCSS("font-size", "18px");
        await input.fill("구름의 모양은 왜 달라질까요?");
        await expect(page.getByRole("button", { name: "질문 분석하기", exact: true })).toBeEnabled();
        await expect(page.locator('li[aria-current="step"]')).toContainText("질문 작성");
        expect((await page.getByRole("combobox", { name: "날짜로 거르기" }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
        await expectTextContrast(page.locator(".student-ask-reference-panel li").first());
      } else {
        await page.getByRole("button", { name: /2026-09/ }).click();
        await expect(page.getByText("2026-09-06 · 과학 · 날씨", { exact: true })).toBeVisible();
        const help = page.getByRole("button", { name: "간단 질문수업 만들기 안내 보기", exact: true });
        await help.click();
        await page.mouse.move(1, 1);
        await expect(help).toHaveAttribute("aria-expanded", "true");
        await expect(page.getByRole("tooltip").filter({ visible: true })).toContainText("질문");
        await page.keyboard.press("Escape");
        await expect(help).toHaveAttribute("aria-expanded", "false");
        await expect(page).toHaveURL(/\/teacher-sessions$/);
        await expectTextContrast(page.locator(".teacher-sessions-summary-grid p").first());
      }

      await expectNoHorizontalPageOverflow(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath("밝은화면.png"), fullPage: true });
      if (width < 1024) {
        await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
        const nav = page.locator("header nav");
        await expect(nav.getByRole("link", { name: "질문학습", exact: true })).toBeVisible();
        await expect(nav.getByRole("link", { name: "질문놀이", exact: true })).toBeVisible();
        await expectNoHorizontalPageOverflow(page);
        await page.getByRole("button", { name: "메뉴 닫기", exact: true }).click();
      }
      await page.getByRole("button", { name: "어두운 테마로 변경" }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expectNoHorizontalPageOverflow(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath("어두운화면.png"), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}

test("학생 홈의 포인트·순위와 놀이 선택을 유지한다", async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const { errors } = await preparePage(page, "STUDENT", baseURL!);
  await page.route("**/api/points/me", (route) => route.fulfill({ json: { totalPoints: 42, recent: [] } }));
  await page.route("**/api/points/leaderboard**", (route) => route.fulfill({ json: { me: { rank: 3, totalPoints: 42 } } }));
  await page.route("**/api/question-games", (route) => route.fulfill({ json: BUILT_IN_GAMES }));
  await page.goto("/student-dashboard");
  await expect(page.getByText("42", { exact: true })).toBeVisible();
  await expect(page.getByText("3등", { exact: true })).toHaveCount(3);
  await expectNoHorizontalPageOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("학생홈.png"), fullPage: true });
  await page.goto("/student-question-play");
  await expect(page.getByRole("heading", { name: "질문놀이", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "질문 주사위", exact: true })).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("질문놀이.png"), fullPage: true });
  expect(errors).toEqual([]);
});
