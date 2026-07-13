import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import {
  cleanupQuestionLearningTeacher,
  cleanupStudentAskFlow,
  prepareQuestionLearningTeacher,
  prepareStudentAskFlow,
  type QuestionLearningTeacherFixture,
  type StudentAskFlowFixture,
} from "./helpers/test-db";
import { loginAsStudent } from "./helpers/login";

const VIEWPORTS_BY_PROJECT = {
  chromium: [
    { width: 320, height: 800 },
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ],
  tablet: [{ width: 820, height: 1180 }],
} as const;

const TOTAL_SLIDES = 14;

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

async function loginAsTeacher(page: Page, teacher: QuestionLearningTeacherFixture) {
  await page.goto("/login");
  await page.getByRole("tab", { name: /교사/ }).click();
  await page.locator("#t-email").fill(teacher.email);
  await page.locator("#t-password").fill(teacher.password);
  await page.getByRole("button", { name: "교사 로그인" }).click();
  await page.waitForURL("**/teacher-dashboard", { timeout: 20_000 });
}

async function openAuthenticatedPage(
  browser: Browser,
  expectedRole: "STUDENT" | "TEACHER",
  login: (page: Page) => Promise<void>,
) {
  const context = await browser.newContext({
    colorScheme: "dark",
    locale: "ko-KR",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    window.localStorage.setItem("question-lab-theme", "dark");
  });
  const loginPage = await context.newPage();
  await login(loginPage);
  await expect
    .poll(
      () =>
        loginPage.evaluate(async () => {
          const response = await fetch("/api/auth/session", { cache: "no-store" });
          const session = (await response.json()) as { user?: { role?: string } };
          return session.user?.role ?? null;
        }),
      { timeout: 20_000 },
    )
    .toBe(expectedRole);
  await expect(loginPage.locator("header").getByRole("heading", { name: "Question Lab", exact: true })).toBeVisible();
  const page = await context.newPage();
  await loginPage.close();
  return { context, page };
}

async function expectPanelFitsFrame(page: Page, panel: Locator, frame: Locator) {
  const [panelMetrics, frameRect] = await Promise.all([
    panel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        textLength: element.textContent?.trim().length ?? 0,
        horizontalOverflow: element.scrollWidth - element.clientWidth,
        verticalOverflow: element.scrollHeight - element.clientHeight,
      };
    }),
    frame.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }),
  ]);
  const metrics = {
    ...panelMetrics,
    outsideLeft: frameRect.left - panelMetrics.rect.left,
    outsideTop: frameRect.top - panelMetrics.rect.top,
    outsideRight: panelMetrics.rect.right - frameRect.right,
    outsideBottom: panelMetrics.rect.bottom - frameRect.bottom,
  };

  expect(metrics.textLength).toBeGreaterThan(10);
  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(metrics.verticalOverflow).toBeLessThanOrEqual(1);
  expect(metrics.outsideLeft).toBeLessThanOrEqual(2);
  expect(metrics.outsideTop).toBeLessThanOrEqual(2);
  expect(metrics.outsideRight).toBeLessThanOrEqual(2);
  expect(metrics.outsideBottom).toBeLessThanOrEqual(2);
}

async function expectViewportSpecificLayout(page: Page, width: number) {
  const brand = page.getByRole("heading", { name: "Question Lab", exact: true });
  const tools = brand.locator("xpath=../following-sibling::div[1]");
  await expectLeftOf(brand, tools);

  if (width === 320) {
    const coverTitle = page.getByRole("heading", { name: "질문 탐정단", exact: true });
    const titleMetrics = await coverTitle.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(style.lineHeight),
      };
    });
    expect(titleMetrics.height).toBeLessThanOrEqual(titleMetrics.lineHeight + 1);
  }

  if (width === 390) {
    await expect(page.locator("#lang-select")).toBeAttached();
    const languageControl = page.locator("#lang-select").locator("xpath=..");
    await expectLeftOf(brand, languageControl);
  }

  if (width === 1440) {
    const frame = page.getByTestId("question-learning-stage").locator(":scope > div").first();
    const frameBox = await frame.boundingBox();
    expect(frameBox).not.toBeNull();
    expect(frameBox!.width / frameBox!.height).toBeGreaterThan(1.7);
    expect(frameBox!.width / frameBox!.height).toBeLessThan(1.85);

    const stage = page.getByTestId("question-learning-stage");
    const visibleTabCount = await stage.getByRole("tab").evaluateAll((tabs) =>
      tabs.filter((tab) => {
        const rect = tab.getBoundingClientRect();
        return getComputedStyle(tab).display !== "none" && rect.width > 0 && rect.height > 0;
      }).length,
    );
    expect(visibleTabCount).toBe(TOTAL_SLIDES);
  }
}

async function verifyLearningRoute(page: Page, route: string, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto(route);

  const coverTitle = page.getByRole("heading", { name: "질문 탐정단", exact: true });
  await expect(coverTitle).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: /밝은/ })).toBeVisible();
  await expectViewportSpecificLayout(page, viewport.width);
  await expectNoHorizontalOverflow(page);

  const stage = page.getByTestId("question-learning-stage");
  const frame = stage.locator(":scope > div").first();
  const panel = stage.getByRole("tabpanel");
  const tabs = stage.locator('[role="tab"][aria-controls="question-learning-panel"]');
  const nextSlide = page.getByRole("button", { name: "다음", exact: true });

  await expect(tabs).toHaveCount(TOTAL_SLIDES);
  const reducedMotion = await panel.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      duration: style.transitionDuration,
      property: style.transitionProperty,
    };
  });
  expect(reducedMotion.duration.split(", ").every((duration) => duration === "0s")).toBe(true);
  expect(reducedMotion.property).toBe("none");

  for (let slideIndex = 0; slideIndex < TOTAL_SLIDES; slideIndex += 1) {
    await expect(tabs.nth(slideIndex)).toHaveAttribute("aria-selected", "true");
    await expectPanelFitsFrame(page, panel, frame);
    await expectNoHorizontalOverflow(page);

    if (slideIndex === 0) {
      const coverImage = panel.locator("img");
      await expect(coverImage).toBeVisible();
      expect(await coverImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }

    if (slideIndex === 11) {
      for (const heading of ["답에 필요한 사고와 근거", "탐구 목적"]) {
        await expect(page.getByText(heading, { exact: true }).filter({ visible: true }).first()).toBeVisible();
      }
      for (const guide of [
        "자료에 제시된 절차를 찾아 순서대로 확인하기",
        "여러 사실을 연결해 관계와 영향을 설명하기",
        "가치와 책임을 따져 타당한 근거로 판단하기",
      ]) {
        await expect(page.getByText(guide, { exact: true }).filter({ visible: true })).toHaveCount(1);
      }
    }

    if (slideIndex === 12) {
      await page.getByRole("button", { name: "사실적 질문", exact: true }).click();
      await page.getByRole("button", { name: "다음 문제", exact: true }).click();
      const secondPrompt = page.getByText("숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?", {
        exact: true,
      });
      await expect(secondPrompt).toBeFocused();
      await expect(secondPrompt).toHaveAttribute("aria-live", "polite");
    }

    if (slideIndex < TOTAL_SLIDES - 1) {
      await nextSlide.click();
    }
  }
}

async function verifyTeacherViewTabs(page: Page) {
  const tablist = page.getByRole("tablist", { name: "교사용 질문학습 보기" });
  const learningTab = tablist.getByRole("tab", { name: "학습 내용" });
  const teachingTab = tablist.getByRole("tab", { name: "수업 활용" });
  const learningPanel = page.locator("#question-learning-panel-learning");
  const teachingPanel = page.locator("#question-learning-panel-teaching");

  await expect(learningTab).toHaveAttribute("aria-selected", "true");
  await expect(learningTab).toHaveAttribute("aria-controls", "question-learning-panel-learning");
  await expect(learningPanel).toHaveAttribute("aria-labelledby", "question-learning-view-learning");
  await expect(learningPanel).toBeVisible();
  await expect(teachingPanel).toBeHidden();

  await teachingTab.click();
  await expect(teachingTab).toHaveAttribute("aria-selected", "true");
  await expect(teachingTab).toHaveAttribute("aria-controls", "question-learning-panel-teaching");
  await expect(teachingPanel).toHaveAttribute("aria-labelledby", "question-learning-view-teaching");
  await expect(teachingPanel).toBeVisible();
  await expect(learningPanel).toBeHidden();

  await learningTab.click();
  await expect(learningTab).toHaveAttribute("aria-selected", "true");
  await expect(learningPanel).toBeVisible();
  await expect(teachingPanel).toBeHidden();
}

test.describe("질문학습 화면", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  let studentFixture: StudentAskFlowFixture;
  let teacherFixture: QuestionLearningTeacherFixture;

  test.beforeAll(async ({}, testInfo) => {
    const key = `learning-${testInfo.project.name}`;
    studentFixture = await prepareStudentAskFlow(key);
    teacherFixture = await prepareQuestionLearningTeacher(key);
  });

  test.afterAll(async ({}, testInfo) => {
    const key = `learning-${testInfo.project.name}`;
    await cleanupStudentAskFlow(key);
    await cleanupQuestionLearningTeacher(key);
  });

  test("학생 경로를 모든 목표 화면에서 제공한다", async ({ browser }, testInfo) => {
    const viewports = VIEWPORTS_BY_PROJECT[testInfo.project.name as keyof typeof VIEWPORTS_BY_PROJECT];
    expect(viewports).toBeDefined();
    const { context, page } = await openAuthenticatedPage(browser, "STUDENT", (loginPage) =>
      loginAsStudent(loginPage, studentFixture.student),
    );

    try {
      for (const viewport of viewports) {
        await verifyLearningRoute(page, "/student-question-learning", viewport);
      }
      await page.goto("/student-practice");
      await expect(page.getByRole("button", { name: "질문 유형 알아보기", exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });

  test("교사 경로를 모든 목표 화면에서 제공한다", async ({ browser }, testInfo) => {
    const viewports = VIEWPORTS_BY_PROJECT[testInfo.project.name as keyof typeof VIEWPORTS_BY_PROJECT];
    expect(viewports).toBeDefined();
    const { context, page } = await openAuthenticatedPage(browser, "TEACHER", (loginPage) =>
      loginAsTeacher(loginPage, teacherFixture),
    );

    try {
      for (const viewport of viewports) {
        await verifyLearningRoute(page, "/teacher-question-learning", viewport);
      }
      await verifyTeacherViewTabs(page);
      await page.goto("/teacher-practice");
      await expect(page.getByRole("button", { name: "질문 유형 알아보기", exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    } finally {
      await context.close();
    }
  });
});
