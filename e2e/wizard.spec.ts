/**
 * 탐구질문 마법사 5단계 관통 e2e.
 *
 * 검증 범위: 로그인 → 1단계 교육과정 탐색(학년군·교과·영역 선택, 성취기준 자동 적용)
 * → 2~5단계 상태 연쇄 → 저장 → 저장된 탐구질문 탭에서 확인.
 *
 * 결정성 설계(의도):
 * - AI 생성(/api/unit-design/generate)과 교육과정 조회(/api/curriculum*)는
 *   고정 픽스처로 스텁 — 이 테스트의 목적은 단계 간 UI 상태 연쇄이며,
 *   해당 서버 라우트들은 단위 테스트가 별도로 지킨다.
 * - 로그인·저장(/api/unit-design)·저장 목록은 실제 서버·DB를 사용하고,
 *   흔적은 afterAll에서 제거한다(합성 테스트 교사 계정 사용).
 */
import { test, expect, type Page } from "@playwright/test";
import {
  prepareTestTeacher,
  cleanupTestArtifacts,
  getAnyCurriculumAreaId,
  TEST_TEACHER_EMAIL,
  E2E_TITLE_PREFIX,
} from "./helpers/test-db";

// 저장 시 FK(curriculumAreaId)가 유효해야 하므로 실제 DB의 영역 id를 쓴다(내용은 전부 스텁)
let AREA_ID = "";

const CURRICULUM_AREA = {
  id: "",
  subject: "과학",
  gradeRange: "5-6",
  area: "E2E 생명",
  coreIdea: "생물은 환경과 상호작용한다.\n생태계는 에너지 흐름으로 유지된다.",
  knowledgeItems: ["광합성", "먹이 사슬"],
  processItems: ["관찰하기", "자료 해석"],
  valueItems: ["생명 존중"],
  middleKnowledgeItems: [],
  middleProcessItems: [],
  middleValueItems: [],
  achievements: [
    { code: "[6과01-01]", text: "생물과 환경의 관계를 설명할 수 있다." },
    { code: "[6과01-02]", text: "먹이 사슬을 모형으로 표현할 수 있다." },
  ],
  units: [],
};

const GENERATE_FIXTURES: Record<string, unknown> = {
  keywords: { keywords: ["광합성", "먹이사슬", "생태계"] },
  sentences: { sentences: ["생물은 서로 연결되어 살아간다.", "에너지는 먹이 사슬을 따라 흐른다."] },
  questions: { questions: ["생태계는 어떻게 균형을 유지할까?", "먹이 사슬이 끊어지면 어떤 일이 생길까?"] },
  inquiry: {
    inquiryQuestions: [
      { type: "factual", content: "광합성에 필요한 것은 무엇일까?" },
      { type: "conceptual", content: "먹이 사슬과 먹이 그물은 어떻게 다를까?" },
      { type: "controversial", content: "생태계 보전을 위해 개발을 제한해야 할까?" },
    ],
  },
  learning_guides: {
    learningGuides: {
      coreIdea: {
        explanation: "생물과 환경이 서로 영향을 주고받는 큰 원리를 알아봐요.",
        lifeConnection: "학교 화단에서 곤충과 식물이 함께 살아가는 모습을 떠올려 보세요.",
        keywords: [
          { term: "생태계", meaning: "생물과 환경이 서로 관계를 맺는 체계" },
          { term: "먹이 사슬", meaning: "먹고 먹히는 관계로 이어진 생물의 연결" },
          { term: "광합성", meaning: "식물이 빛을 이용해 양분을 만드는 과정" },
        ],
      },
      coreSentences: [
        { index: 0, explanation: "생물은 혼자가 아니라 다른 생물과 이어져 살아가요." },
        { index: 1, explanation: "에너지는 생물이 서로 먹고 먹히는 관계를 따라 이동해요." },
      ],
      essentialQuestions: [
        { index: 0, thinkingFocus: "생물 사이의 관계와 변화를 살펴봐요.", perspectives: ["관계", "변화"] },
        { index: 1, thinkingFocus: "먹이 관계가 달라질 때 생기는 일을 살펴봐요.", perspectives: ["원인", "결과"] },
      ],
    },
    guides: [
      {
        index: 0,
        meaning: "식물이 양분을 만들 때 필요한 조건을 찾는 질문이에요.",
        keywords: [{ term: "광합성", meaning: "식물이 빛으로 양분을 만드는 과정" }],
        thinkingStart: "식물이 자랄 때 필요한 것을 떠올려 보세요.",
      },
      {
        index: 1,
        meaning: "두 먹이 관계의 공통점과 차이점을 찾는 질문이에요.",
        keywords: [{ term: "먹이 그물", meaning: "여러 먹이 사슬이 얽힌 관계" }],
        thinkingStart: "한 생물이 여러 생물과 이어지는 모습을 살펴보세요.",
      },
      {
        index: 2,
        meaning: "개발과 생태계 보전 사이에서 판단 근거를 찾는 질문이에요.",
        keywords: [{ term: "생태계 보전", meaning: "생물과 환경의 관계를 지키는 일" }],
        thinkingStart: "개발의 도움과 생태계에 주는 영향을 나누어 살펴보세요.",
      },
    ],
  },
};

async function stubCurriculumAndAi(page: Page) {
  CURRICULUM_AREA.id = AREA_ID;
  await page.route("**/api/curriculum**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/enriched")) {
      await route.fulfill({ json: {} });
      return;
    }
    if (url.searchParams.get("areaId")) {
      await route.fulfill({ json: CURRICULUM_AREA });
      return;
    }
    // subject+gradeRange → 영역 목록
    await route.fulfill({ json: { areas: [{ id: AREA_ID, area: CURRICULUM_AREA.area }] } });
  });

  await page.route("**/api/unit-design/generate", async (route) => {
    const body = route.request().postDataJSON() as { step?: string };
    const fixture = GENERATE_FIXTURES[body.step ?? ""];
    if (fixture) await route.fulfill({ json: fixture });
    else await route.fulfill({ status: 400, json: { error: `unknown step: ${body.step}` } });
  });
}

test.describe("탐구질문 마법사 5단계", () => {
  // dev 서버 콜드 컴파일(로그인·마법사 첫 진입)이 느릴 수 있어 여유를 준다
  test.setTimeout(120_000);

  let password: string;
  const title = `${E2E_TITLE_PREFIX}${Date.now()}`;

  test.beforeAll(async () => {
    password = await prepareTestTeacher();
    AREA_ID = await getAnyCurriculumAreaId();
  });

  test.afterAll(async () => {
    await cleanupTestArtifacts();
  });

  test("교육과정 탐색부터 저장·목록 확인까지 완주한다", async ({ page }) => {
    await stubCurriculumAndAi(page);

    // ── 로그인 ──
    await page.goto("/login");
    await page.getByRole("tab", { name: /교사/ }).click();
    await page.locator("#t-email").fill(TEST_TEACHER_EMAIL);
    await page.locator("#t-password").fill(password);
    await page.getByRole("button", { name: "교사 로그인" }).click();
    await page.waitForURL("**/teacher-dashboard", { timeout: 15000 });

    // ── 1단계: 학년군 → 교과 → 영역 ──
    await page.goto("/teacher-curriculum");
    await expect(page.getByText("1단계 · 교육과정 탐색")).toBeVisible();
    // 네비의 언어 토글도 <select>라서, 각 셀렉트는 보유한 옵션 값으로 특정한다
    const byOption = (value: string) =>
      page.locator("select").filter({ has: page.locator(`option[value="${value}"]`) });
    await byOption("5-6").selectOption("5-6");
    await byOption("과학").selectOption("과학");
    await byOption(AREA_ID).selectOption(AREA_ID);

    // 영역 데이터 로드 → 성취기준 자동 전체 적용 → 다음 버튼 활성화
    const toStep2 = page.getByRole("button", { name: /다음 단계: 핵심어/ });
    await expect(toStep2).toBeEnabled({ timeout: 10000 });
    await toStep2.click();

    // ── 2단계: 핵심어(스텁 결과 표시 — 1단계 내용요소와 겹치지 않는 고유 값으로 단언) ──
    await expect(page.getByText("먹이사슬", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /다음 단계: 핵심 문장/ }).click();

    // ── 3단계: 핵심 문장 ──
    await expect(page.getByText("에너지는 먹이 사슬을 따라 흐른다.")).toBeVisible();
    await page.getByRole("button", { name: /다음 단계: 핵심 질문/ }).click();

    // ── 4단계: 핵심 질문 ──
    await expect(page.getByText("생태계는 어떻게 균형을 유지할까?")).toBeVisible();
    await page.getByRole("button", { name: /다음 단계: 탐구 질문/ }).click();

    // ── 5단계: 탐구 질문 + 저장 폼 ──
    await expect(page.getByText("먹이 사슬과 먹이 그물은 어떻게 다를까?")).toBeVisible();

    // 학생용 설명 자동 생성 → 핵심 낱말 자동 입력 + 네 설명 영역 색 구분
    await page.getByRole("button", { name: "학생용 설명 만들기" }).click();
    await expect(page.getByLabel("핵심 아이디어 핵심 낱말"))
      .toHaveValue(/생태계: 생물과 환경이 서로 관계를 맺는 체계/);
    await expect(page.locator('[data-student-guide-section="core-idea"]')).toHaveClass(/bg-amber-50\/70/);
    await expect(page.locator('[data-student-guide-section="core-sentence"]')).toHaveClass(/bg-sky-50\/70/);
    await expect(page.locator('[data-student-guide-section="essential-question"]')).toHaveClass(/bg-violet-50\/70/);
    await expect(page.locator('[data-student-guide-section="inquiry-question"]')).toHaveClass(/bg-emerald-50\/70/);

    // 저장 폼: 학년 선택 + 단원명 입력 (날짜는 오늘 기본값)
    await page
      .locator("select")
      .filter({ has: page.locator('option[value="5"]') })
      .selectOption("5");
    await page.getByPlaceholder("예: 식물의 한살이").last().fill(title);

    const saveBtn = page.getByRole("button", { name: /저장만 하기/ });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // ── 저장 후: 저장된 탐구질문 탭으로 전환되고 방금 저장한 설계가 보인다 ──
    // 필터 셀렉트의 hidden <option>이 아닌, 목록 항목(펼침 버튼)으로 확인
    await expect(page.getByRole("button", { name: new RegExp(title) })).toBeVisible({ timeout: 10000 });
  });
});
