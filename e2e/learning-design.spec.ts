import { expect, test, type Page } from "@playwright/test";
import { preparePage } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow, expectTextContrast } from "./helpers/question-game-room";
import { BUILT_IN_GAMES } from "../src/lib/question-games-data";

async function expectClassCreationHelp(page: Page, browserName: string) {
  const nav = page.getByRole("navigation", { name: "질문수업 작업공간" });
  const floatingHelp = await page.evaluate(() => matchMedia("(min-width: 640px) and (hover: hover) and (pointer: fine)").matches);
  await expect(nav.getByRole("button")).toHaveCount(0);
  const labels = ["간단 질문수업 만들기", "탐구질문으로 수업 만들기"];
  for (const label of labels) {
    const link = nav.getByRole("link", { name: label, exact: true });
    const help = nav.locator(`[id="${await link.getAttribute("aria-describedby")}"]`);
    await expect(help).toHaveCount(1);
    await expect(link).toHaveAccessibleDescription(/수업을/);
    if (floatingHelp) {
      await expect(help).toBeHidden();
      await link.hover();
      await expect(help).toBeVisible();
      await help.hover();
      await expect(help).toBeVisible();
      await expectTextContrast(help.locator("p"));
      await page.keyboard.press("Escape");
      await expect(help).toBeHidden();
      await page.mouse.move(1, 1);
      await link.focus();
      await expect(help).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(help).toBeHidden();
      await link.blur();
    } else {
      await expect(help).toBeVisible();
      const buttonBox = (await link.boundingBox())!;
      const helpBox = (await help.boundingBox())!;
      expect(helpBox.y).toBeGreaterThanOrEqual(buttonBox.y + buttonBox.height - 1);
      await expectTextContrast(help.locator("p"));
      await link.focus();
      await page.keyboard.press("Escape");
      await expect(help).toBeVisible();
      await link.blur();
    }
  }
  await nav.getByRole("link", { name: "질문수업 목록", exact: true }).focus();
  for (const label of labels) {
    // 사파리 기본 설정에서는 링크까지 순회하려면 옵션 키를 함께 누른다.
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(nav.getByRole("link", { name: label, exact: true })).toBeFocused();
  }
  await nav.getByRole("link", { name: labels[1], exact: true }).blur();
}

// 실제 화면과 상호작용을 검증하며 시험용 조회 응답으로 운영 자료 변경을 피한다.
for (const width of [375, 768, 1440]) {
  for (const role of ["STUDENT", "TEACHER"] as const) {
    test(`${role === "STUDENT" ? "학생" : "교사"} ${width}픽셀에서 글씨·메뉴·안내가 겹치지 않는다`, async ({ page, baseURL, browserName }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const { errors } = await preparePage(page, role, baseURL!);
      await page.route("**/api/teacher/students**", (route) => route.fulfill({ json: { students: [], teacherClasses: [] } }));
      await page.route("**/api/unit-design", (route) => route.fulfill({ json: [] }));
      await page.goto(role === "STUDENT" ? "/student-ask?sessionId=filter-weather" : "/teacher-sessions");
      await expect(page.locator("main")).toBeVisible();

      if (role === "STUDENT") {
        const input = page.getByLabel("질문", { exact: true });
        await expect(input).toBeVisible();
        await expect(input).toHaveCSS("font-size", "18px");
        await input.fill("구름의 모양은 왜 달라질까요?");
        await expect(page.getByRole("button", { name: "질문 분석하기", exact: true })).toBeEnabled();
        await expect(page.locator('li[aria-current="step"]')).toContainText("질문 작성");
        if (width < 1024) {
          const changeSession = page.getByRole("button", { name: "수업 변경", exact: true });
          await expect(changeSession).toHaveAttribute("aria-expanded", "false");
          await changeSession.click();
          await expect(changeSession).toHaveAttribute("aria-expanded", "true");
        }
        expect((await page.getByRole("combobox", { name: "날짜로 거르기" }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
        if (width < 1024) {
          await page.getByRole("button", { name: "수업 변경", exact: true }).click();
          await expect(input).toHaveValue("구름의 모양은 왜 달라질까요?");
        }
        await expectTextContrast(page.locator(".student-ask-reference-panel li").first());
      } else {
        await page.getByRole("button", { name: /2026-09/ }).click();
        await expect(page.getByText("2026-09-06 · 과학 · 날씨", { exact: true })).toBeVisible();
        await expectClassCreationHelp(page, browserName);
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
      if (role === "TEACHER") {
        await expectTextContrast(page.getByText("2026-09-06 · 과학 · 날씨", { exact: true }));
        await expectTextContrast(page.getByRole("link", { name: "간단 질문수업 만들기", exact: true }));
        await expectClassCreationHelp(page, browserName);
      } else {
        await expectTextContrast(page.locator(".student-ask-reference-panel li").first());
      }
      await expectNoHorizontalPageOverflow(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath("어두운화면.png"), fullPage: true });
      if (role === "TEACHER") {
        const nav = page.getByRole("navigation", { name: "질문수업 작업공간" });
        const touch = testInfo.project.use.hasTouch;
        const quick = nav.getByRole("link", { name: "간단 질문수업 만들기", exact: true });
        if (touch) await quick.tap(); else await quick.click();
        await expect(page).toHaveURL(/\/teacher-sessions\?view=quick$/);
        await expect(page.locator("#quick-question-class-form")).toBeVisible();
        const inquiry = nav.getByRole("link", { name: "탐구질문으로 수업 만들기", exact: true });
        if (touch) await inquiry.tap(); else await inquiry.click();
        await expect(page).toHaveURL(/\/teacher-curriculum$/);
        await expect(inquiry).toHaveAttribute("aria-current", "page");
        await expect(page.locator(".learning-page-header .lucide-calendar-days")).toBeVisible();
      }
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
  await expect(page.locator(".learning-page-header img")).toHaveCount(0);
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

test("브라우저가 테마 저장을 막아도 화면과 테마 전환이 동작한다", async ({ page, baseURL }) => {
  const { errors } = await preparePage(page, "STUDENT", baseURL!);
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "question-lab-theme") throw new DOMException("저장소 접근 제한", "SecurityError");
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "question-lab-theme") throw new DOMException("저장소 접근 제한", "SecurityError");
      return setItem.call(this, key, value);
    };
  });
  await page.goto("/student-ask");
  await expect(page.getByLabel("질문", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "어두운 테마로 변경" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "밝은 테마로 변경" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  expect(errors).toEqual([]);
});
