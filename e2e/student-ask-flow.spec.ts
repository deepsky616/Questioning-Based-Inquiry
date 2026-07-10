/**
 * 학생 질문 작성 핵심 흐름 e2e.
 *
 * 검증 범위: 태블릿 화면 크기에서 학생 로그인 → 수업 세션 선택 상태 확인
 * → 질문 입력 → AI 분류 → 저장 → 내 질문 목록에서 방금 질문 확인.
 *
 * 결정성 설계:
 * - 로그인, 세션 조회, 질문 저장, 내 질문 조회는 실제 서버와 DB를 사용한다.
 * - AI 분류(/api/classify)는 고정 응답으로 스텁해 외부 모델 상태와 비용에 의존하지 않는다.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  cleanupStudentAskFlow,
  prepareStudentAskFlow,
  type StudentAskFlowFixture,
} from "./helpers/test-db";
import { loginAsStudent } from "./helpers/login";

async function stubQuestionClassification(page: Page) {
  await page.route("**/api/config", async (route) => {
    await route.fulfill({ json: { configured: true } });
  });

  await page.route("**/api/classify", async (route) => {
    await route.fulfill({
      json: {
        closure: "open",
        cognitive: "conceptual",
        closureScore: 0.91,
        cognitiveScore: 0.88,
        reasoning: "질문이 원인과 관계를 탐구하도록 열려 있습니다.",
      },
    });
  });
}

test.describe("학생 질문 작성 흐름", () => {
  test.setTimeout(120_000);

  let fixture: StudentAskFlowFixture;

  // 스펙×프로젝트별로 학생·세션을 분리해 병렬 실행 경합을 막는다
  test.beforeAll(async ({}, testInfo) => {
    fixture = await prepareStudentAskFlow(`ask-${testInfo.project.name}`);
  });

  test.afterAll(async ({}, testInfo) => {
    await cleanupStudentAskFlow(`ask-${testInfo.project.name}`);
  });

  test("태블릿에서 질문을 분석하고 저장한 뒤 내 질문에서 확인한다", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await stubQuestionClassification(page);

    await loginAsStudent(page, fixture.student);

    await page.goto(`/student-ask?sessionId=${fixture.session.id}`);
    await expect(page.getByRole("button", { name: new RegExp(fixture.session.topic) })).toBeVisible({
      timeout: 15000,
    });

    const question = `${fixture.questionPrefix} 생태계 균형은 왜 달라질까?`;
    await page.locator("#content").fill(question);
    await page.getByRole("button", { name: /질문 분석하기/ }).click();

    await expect(page.getByText("열린 질문", { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("개념적 질문", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /질문 저장하기/ }).click();

    await expect(page.getByText("질문이 저장되었습니다")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "내 질문 보기" }).click();
    await page.waitForURL("**/student-questions", { timeout: 10000 });
    await expect(page.getByText(question).first()).toBeVisible({ timeout: 15000 });
  });
});
