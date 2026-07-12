import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupStudentAskFlow,
  prepareStudentAskFlow,
  type StudentAskFlowFixture,
} from "./helpers/test-db";
import { loginAsStudent } from "./helpers/login";

const VIEWPORT_BY_PROJECT = {
  chromium: { width: 320, height: 800 },
  tablet: { width: 820, height: 1180 },
} as const;

test.use({ contextOptions: { reducedMotion: "reduce" } });

async function expectNoHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
}

async function expectLeftOf(left: Locator, right: Locator) {
  const [leftBox, rightBox] = await Promise.all([left.boundingBox(), right.boundingBox()]);
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(leftBox!.x + leftBox!.width).toBeLessThanOrEqual(rightBox!.x);
}

test.describe("학생 질문학습 화면", () => {
  test.setTimeout(120_000);

  let fixture: StudentAskFlowFixture;

  test.beforeAll(async ({}, testInfo) => {
    fixture = await prepareStudentAskFlow(`learning-${testInfo.project.name}`);
  });

  test.afterAll(async ({}, testInfo) => {
    await cleanupStudentAskFlow(`learning-${testInfo.project.name}`);
  });

  test("작은 화면과 태블릿에서 학습과 연습 흐름을 온전히 제공한다", async ({ page }, testInfo) => {
    const viewport = VIEWPORT_BY_PROJECT[testInfo.project.name as keyof typeof VIEWPORT_BY_PROJECT];
    expect(viewport).toBeDefined();
    await page.setViewportSize(viewport);
    await loginAsStudent(page, fixture.student);

    const learning = await page.context().newPage();
    await learning.setViewportSize(viewport);
    await learning.emulateMedia({ reducedMotion: "reduce" });

    try {
      await learning.goto("/student-question-learning");

      const coverTitle = learning.getByRole("heading", { name: "질문 탐정단", exact: true });
      await expect(coverTitle).toBeVisible({ timeout: 15_000 });
      const coverTitleMetrics = await coverTitle.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          height: element.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      });
      expect(coverTitleMetrics.height).toBeLessThanOrEqual(coverTitleMetrics.lineHeight + 1);

      const brand = learning.getByRole("heading", { name: "Question Lab", exact: true });
      const headerRow = brand.locator("xpath=../..");
      const tools = headerRow.locator(":scope > div").nth(1);
      await expectLeftOf(brand, tools);
      await expectNoHorizontalOverflow(learning);

      const nextSlide = learning.getByRole("button", { name: "다음", exact: true });
      for (let step = 0; step < 11; step += 1) {
        await nextSlide.click();
      }

      for (const heading of ["답에 필요한 사고와 근거", "탐구 목적"]) {
        await expect(learning.getByText(heading, { exact: true }).filter({ visible: true }).first()).toBeVisible();
      }
      for (const guide of [
        "자료에 제시된 절차를 찾아 순서대로 확인하기",
        "여러 사실을 연결해 관계와 영향을 설명하기",
        "가치와 책임을 따져 타당한 근거로 판단하기",
      ]) {
        await expect(learning.getByText(guide, { exact: true }).filter({ visible: true })).toHaveCount(1);
      }
      for (const purpose of [
        "지식 쌓기 (재료 준비)",
        "이해 넓히기 (연결하기)",
        "판단하기 (선택하기)",
      ]) {
        await expect(learning.getByText(purpose, { exact: true }).filter({ visible: true })).toHaveCount(1);
      }
      await expectNoHorizontalOverflow(learning);

      await nextSlide.click();
      await learning.getByRole("button", { name: "사실적 질문", exact: true }).click();
      await learning.getByRole("button", { name: "다음 문제", exact: true }).click();
      const secondPrompt = learning.getByText("숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?", {
        exact: true,
      });
      await expect(secondPrompt).toBeFocused();
      await expect(secondPrompt).toHaveAttribute("aria-live", "polite");
      await expectNoHorizontalOverflow(learning);

      await learning.goto("/student-practice");
      await expect(learning.getByRole("button", { name: "질문 유형 알아보기", exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expectNoHorizontalOverflow(learning);
    } finally {
      await learning.close();
    }
  });
});
