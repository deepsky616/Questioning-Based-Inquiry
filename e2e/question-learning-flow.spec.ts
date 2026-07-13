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

const PRACTICE_QUESTION = "숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?";
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
  await page.getByRole("tab", { name: /교사/ }).click();
  await page.locator("#t-email").fill(teacher.email);
  await page.locator("#t-password").fill(teacher.password);
  await page.getByRole("button", { name: "교사 로그인" }).click();
  await page.waitForURL("**/teacher-dashboard", { timeout: 20_000 });
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
  test.setTimeout(120_000);

  let studentFixture: StudentAskFlowFixture;
  let teacherFixture: QuestionLearningTeacherFixture;

  test.beforeAll(async ({}, testInfo) => {
    const key = `flow-${testInfo.project.name}`;
    studentFixture = await prepareStudentAskFlow(key);
    teacherFixture = await prepareQuestionLearningTeacher(key);
  });

  test.afterAll(async ({}, testInfo) => {
    const key = `flow-${testInfo.project.name}`;
    await cleanupStudentAskFlow(key);
    await cleanupQuestionLearningTeacher(key);
  });

  test("학생이 학습과 연습을 거쳐 실제 수업 질문 초안을 만든다", async ({ page }) => {
    await loginAsStudent(page, studentFixture.student);
    const work = await page.context().newPage();
    await stubPracticeRequests(work);

    await work.goto("/student-question-learning");
    await openLastLearningSlide(work);
    await work.getByRole("link", { name: "질문연습 시작" }).click();
    await work.getByRole("tab", { name: "질문 만들기" }).click();
    await work.getByRole("textbox").fill(PRACTICE_QUESTION);
    await work.getByRole("button", { name: /확인(?:받)?기/ }).click();
    await work.getByRole("button", { name: "이 질문으로 질문하기" }).click();

    await expect(work).toHaveURL(/student-ask\?draft=practice/);
    await expect(work.locator("#content")).toHaveValue(PRACTICE_QUESTION);
  });

  test("교사가 학습 뒤 수업 활용 자료를 보고 직접 연습으로 이동한다", async ({ page }) => {
    await loginAsTeacher(page, teacherFixture);
    await stubPracticeRequests(page);

    await page.goto("/teacher-question-learning");
    await openLastLearningSlide(page);
    await page.getByRole("button", { name: "수업 활용 보기" }).click();

    const teachingTitle = page.getByRole("heading", { name: "수업 활용", exact: true });
    await expect(teachingTitle).toBeFocused();
    for (const title of TEACHING_GUIDE_TITLES) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }

    await page.getByRole("button", { name: "학습 내용으로 돌아가기" }).click();
    await page.getByRole("link", { name: "직접 연습하기" }).click();
    await expect(page).toHaveURL(/teacher-practice/);
    await expect(page.getByRole("tab", { name: "직접 해보기" })).toHaveAttribute("aria-selected", "true");
  });
});
