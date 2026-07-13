import { expect, test, type Page } from "@playwright/test";
import {
  cleanupQuestionLearningTeacher,
  cleanupStudentAskFlow,
  prepareQuestionLearningTeacher,
  prepareStudentAskFlow,
  type QuestionLearningTeacherFixture,
  type StudentAskFlowFixture,
} from "./helpers/test-db";
import { loginAsStudent } from "./helpers/login";
import { PRACTICE_QUIZ_BANK } from "../src/lib/question-practice-data";

const PRACTICE_QUESTION = "숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?";
const CONCEPTUAL_QUESTIONS = new Set(
  PRACTICE_QUIZ_BANK.filter((question) => question.cognitive === "conceptual").map(
    (question) => question.content,
  ),
);
const VIEWPORTS_BY_PROJECT = {
  chromium: [
    { width: 320, height: 800 },
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ],
  tablet: [{ width: 820, height: 1180 }],
} as const;
const CONCEPTUAL_PROGRESS = {
  activityAttempts: 8,
  diagnosticAttempts: 5,
  overall: { attempts: 5, correct: 2, accuracy: 40 },
  modes: {
    quiz: { attempts: 5, correct: 2, accuracy: 40 },
    transform: { attempts: 0, correct: 0, accuracy: null },
    create: { attempts: 0, correct: 0, accuracy: null },
  },
  types: {
    closed: { attempts: 0, correct: 0, accuracy: null },
    open: { attempts: 0, correct: 0, accuracy: null },
    factual: { attempts: 0, correct: 0, accuracy: null },
    conceptual: { attempts: 3, correct: 1, accuracy: 33 },
    controversial: { attempts: 0, correct: 0, accuracy: null },
  },
  unknownTypeAttempts: 0,
  capped: false,
  recommendation: {
    kind: "focus",
    tab: "quiz",
    quizMode: "cognitive",
    focus: "conceptual",
  },
} as const;
const TEACHING_GUIDE_TITLES = [
  "질문의 두 분류 축",
  "열린 질문과 닫힌 질문",
  "사실적 질문",
  "개념적 질문",
  "논쟁적 질문",
  "세 유형 비교와 즉석 확인",
] as const;

async function loginAsTeacher(page: Page, teacher: QuestionLearningTeacherFixture) {
  await page.goto("/login");

  await expect(async () => {
    await page.getByRole("tab", { name: "학생 로그인", exact: true }).click();
    await expect(page.locator("#s-school")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("tab", { name: "교사 로그인", exact: true }).click();
  await page.locator("#t-email").fill(teacher.email);
  await page.locator("#t-password").fill(teacher.password);
  await page.getByRole("button", { name: "교사 로그인" }).click();
  await page.waitForURL("**/teacher-dashboard", { timeout: 20_000 });
  await page.reload({ waitUntil: "load" }).catch(() => {});
  await page.waitForURL("**/teacher-dashboard", { timeout: 10_000 });
}

async function stubPracticeRequests(page: Page) {
  await page.route("**/api/practice/bank", (route) =>
    route.fulfill({ json: { quiz: [], transform: [], create: [] } }),
  );
  await page.route("**/api/points/practice", (route) =>
    route.fulfill({
      json: {
        classification: {
          closure: "open",
          cognitive: "conceptual",
          reasoning: "관계를 설명합니다.",
        },
        achieved: true,
        awarded: 3,
      },
    }),
  );
}

async function stubStudentProgress(page: Page) {
  await page.route("**/api/practice/progress", (route) =>
    route.fulfill({ json: CONCEPTUAL_PROGRESS }),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() =>
    [
      { name: "document", element: document.documentElement },
      { name: "body", element: document.body },
    ].map(({ name, element }) => {
      return {
        name,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      };
    }),
  );

  for (const width of widths) {
    expect(
      width.scrollWidth - width.clientWidth,
      `${width.name} 가로 넘침`,
    ).toBeLessThanOrEqual(1);
  }
}

async function expectSearchParams(page: Page, expected: Record<string, string>) {
  for (const [key, value] of Object.entries(expected)) {
    await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(value);
  }
}

async function gotoAuthenticatedRoute(page: Page, route: string) {
  await expect(async () => {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?|$)`));
  }).toPass({ timeout: 30_000 });
}

async function expectConceptualQuestion(page: Page) {
  const question = await page
    .getByText("이 질문은 어떤 유형일까요?", { exact: true })
    .locator("xpath=following-sibling::p[1]")
    .textContent();
  expect(question).not.toBeNull();
  expect(CONCEPTUAL_QUESTIONS.has(question!.trim())).toBe(true);
}

async function installClipboardRecorder(page: Page) {
  await page.addInitScript(() => {
    const state = window as Window & { __copiedPracticeHref?: string };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          state.__copiedPracticeHref = value;
        },
      },
    });
  });
}

async function openLastLearningSlide(page: Page) {
  const stage = page.getByTestId("question-learning-stage");
  const finalSlide = stage.locator('[role="tab"][aria-label="14 / 14"]');

  if (await finalSlide.isVisible()) {
    await finalSlide.click();
  } else {
    await stage.getByRole("tab", { selected: true }).press("End");
  }

  await expect(finalSlide).toHaveAttribute("aria-selected", "true");
}

test.describe("역할별 질문학습 통합 흐름", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(240_000);

  let studentFixture: StudentAskFlowFixture;
  let teacherFixture: QuestionLearningTeacherFixture;

  test.beforeAll(async ({}, testInfo) => {
    const key = `flow-${testInfo.project.name}`;
    studentFixture = await prepareStudentAskFlow(key);
    teacherFixture = await prepareQuestionLearningTeacher(key);
  });

  test.afterAll(async ({}, testInfo) => {
    const key = `flow-${testInfo.project.name}`;
    const cleanupResults = await Promise.allSettled([
      cleanupStudentAskFlow(key),
      cleanupQuestionLearningTeacher(key),
    ]);
    const cleanupErrors = cleanupResults.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );

    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) {
      throw new AggregateError(cleanupErrors, `질문학습 통합 시험 자료 정리 실패: ${key}`);
    }
  });

  test("학생이 학습과 연습을 거쳐 실제 수업 질문 초안을 만든다", async ({ page }) => {
    await loginAsStudent(page, studentFixture.student);
    const work = await page.context().newPage();
    await stubPracticeRequests(work);
    await stubStudentProgress(work);

    await work.goto("/student-question-learning");
    await openLastLearningSlide(work);
    await work.getByRole("link", { name: "질문연습 시작" }).click();
    const questionPractice = work
      .getByRole("tablist", { name: "질문 연습", exact: true })
      .locator("..");
    await questionPractice.getByRole("tab", { name: "질문 만들기" }).click();
    await questionPractice.getByRole("textbox").fill(PRACTICE_QUESTION);
    await questionPractice.getByRole("button", { name: "AI에게 확인받기", exact: true }).click();
    await questionPractice.getByRole("button", { name: "이 질문으로 질문하기" }).click();

    await expect(work).toHaveURL(/student-ask\?draft=practice/);
    await expect(work.locator("#content")).toHaveValue(PRACTICE_QUESTION);
  });

  test("학생 진단 추천이 개념적 내장 문항 연습으로 이어진다", async ({ page }, testInfo) => {
    const viewports = VIEWPORTS_BY_PROJECT[testInfo.project.name as keyof typeof VIEWPORTS_BY_PROJECT];
    expect(viewports).toBeDefined();
    await stubPracticeRequests(page);
    await stubStudentProgress(page);
    await loginAsStudent(page, studentFixture.student);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await gotoAuthenticatedRoute(page, "/student-practice");
      await expect(page.getByText("최근 30일 진단", { exact: true })).toBeVisible();
      await expect(page.getByText("개념적 질문을 더 연습해 보세요", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.getByRole("link", { name: "맞춤 연습 시작", exact: true }).click();
      await expectSearchParams(page, {
        tab: "quiz",
        quizMode: "cognitive",
        focus: "conceptual",
      });
      await expect(page.getByText("개념적 질문 집중", { exact: true })).toBeVisible();
      await expectConceptualQuestion(page);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("교사 수업 활용이 개념적 학급 진단과 내장 연습으로 이어진다", async ({ page }, testInfo) => {
    const viewports = VIEWPORTS_BY_PROJECT[testInfo.project.name as keyof typeof VIEWPORTS_BY_PROJECT];
    expect(viewports).toBeDefined();
    await installClipboardRecorder(page);
    await loginAsTeacher(page, teacherFixture);
    await stubPracticeRequests(page);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await gotoAuthenticatedRoute(page, "/teacher-question-learning");
      await openLastLearningSlide(page);
      await page.getByRole("button", { name: "수업 활용 보기" }).click();

      const teachingTitle = page.getByRole("heading", { name: "수업 활용", exact: true });
      await expect(teachingTitle).toBeFocused();
      for (const title of TEACHING_GUIDE_TITLES) {
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      }

      const conceptualArticle = page
        .getByRole("heading", { name: "개념적 질문", exact: true })
        .locator("xpath=ancestor::article");
      await conceptualArticle.getByRole("link", { name: "학급 진단 보기", exact: true }).click();
      await expectSearchParams(page, {
        view: "stats",
        tab: "quiz",
        quizMode: "cognitive",
        focus: "conceptual",
      });

      await expect(page.getByRole("tab", { name: "학생 연습 현황", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByRole("button", { name: "개념적 질문", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByText("개념적 질문 표본이 아직 없어요", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const studentToggle = page.getByRole("button", { name: new RegExp(teacherFixture.student.name) });
      await expect(studentToggle).toHaveAttribute("aria-expanded", "false");
      const detailsId = await studentToggle.getAttribute("aria-controls");
      expect(detailsId).toBeTruthy();

      await studentToggle.click();
      await expect(studentToggle).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(`#${detailsId}`)).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const preview = page.getByRole("link", { name: "내장 연습 미리보기", exact: true });
      const previewHref = await preview.getAttribute("href");
      expect(previewHref).not.toBeNull();
      const previewUrl = new URL(previewHref!, page.url());
      expect(previewUrl.pathname).toBe("/teacher-practice");
      expect(previewUrl.searchParams.get("view")).toBe("try");
      expect(previewUrl.searchParams.get("tab")).toBe("quiz");
      expect(previewUrl.searchParams.get("quizMode")).toBe("cognitive");
      expect(previewUrl.searchParams.get("focus")).toBe("conceptual");

      await page.getByRole("button", { name: "전체 학생용 주소 복사", exact: true }).click();
      const readCopiedHref = () =>
        page.evaluate(
          () =>
            (window as Window & { __copiedPracticeHref?: string })
              .__copiedPracticeHref ?? null,
        );
      await expect.poll(readCopiedHref).not.toBeNull();
      const copiedHref = await readCopiedHref();
      expect(copiedHref).not.toBeNull();
      const studentUrl = new URL(copiedHref!);
      expect(studentUrl.pathname).toBe("/student-practice");
      expect(studentUrl.searchParams.get("tab")).toBe("quiz");
      expect(studentUrl.searchParams.get("quizMode")).toBe("cognitive");
      expect(studentUrl.searchParams.get("focus")).toBe("conceptual");
      await expect(page.getByRole("status")).toHaveText("학생용 연습 주소를 복사했어요.");

      await preview.click();
      await expectSearchParams(page, {
        view: "try",
        tab: "quiz",
        quizMode: "cognitive",
        focus: "conceptual",
      });
      await expect(page.getByRole("tab", { name: "직접 해보기", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByText("개념적 질문 집중", { exact: true })).toBeVisible();
      await expectConceptualQuestion(page);
      await expectNoHorizontalOverflow(page);
    }
  });
});
