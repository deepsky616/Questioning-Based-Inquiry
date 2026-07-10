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
    await loginAsStudent(page, fixture.student);

    // 로그인 페이지의 잔여 내비게이션(router.refresh)이 같은 탭의 다음 goto를
    // 가로채는 webkit 경합이 있어, 본 흐름은 새 탭(세션 쿠키 공유)에서 진행한다.
    const work = await page.context().newPage();
    await work.setViewportSize({ width: 820, height: 1180 });
    await stubQuestionClassification(work);

    // dev 콜드 컴파일 중 세션 조회가 지연되면 레이아웃이 일시적으로 /login으로
    // 밀어내는 경합이 있어, 진입+확인을 재시도로 감싼다(쿠키는 유효하므로 수렴).
    await expect(async () => {
      await work.goto(`/student-ask?sessionId=${fixture.session.id}`).catch(() => {});
      await expect(work.getByRole("button", { name: new RegExp(fixture.session.topic) })).toBeVisible({
        timeout: 8000,
      });
    }).toPass({ timeout: 60000 });

    const question = `${fixture.questionPrefix} 생태계 균형은 왜 달라질까?`;
    await work.locator("#content").fill(question);
    await work.getByRole("button", { name: /질문 분석하기/ }).click();

    await expect(work.getByText("열린 질문", { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(work.getByText("개념적 질문", { exact: true })).toBeVisible();
    await work.getByRole("button", { name: /질문 저장하기/ }).click();

    await expect(work.getByText("질문이 저장되었습니다")).toBeVisible({ timeout: 10000 });
    await work.getByRole("button", { name: "내 질문 보기" }).click();
    await work.waitForURL("**/student-questions", { timeout: 10000 });
    await expect(work.getByText(question).first()).toBeVisible({ timeout: 15000 });
    await work.close();
  });
});
