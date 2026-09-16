import { expect, test } from "@playwright/test";
import { preparePage } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";

for (const width of [375, 1440]) {
  test(`${width}px 질문 선택과 맞춤 답변 패널 열기·생성·전송을 각각 실행한다`, async ({ page, baseURL }, testInfo) => {
    const { errors } = await preparePage(page, "TEACHER", baseURL!);
    await page.setViewportSize({ width, height: 1000 });
    if (width === 375) await page.addInitScript(() => localStorage.setItem("question-lab-theme", "dark"));
    const generated: string[] = [];
    const sent: Array<{ id: string; content: string }> = [];
    const deleted: string[] = [];
    await page.route("**/api/questions/*/ai-answer", route => {
      const id = new URL(route.request().url()).pathname.split("/")[3];
      generated.push(id);
      return route.fulfill({ json: { answer: "온도를 바꾸어 관찰하고 결과를 비교해 보세요." } });
    });
    await page.route("**/api/questions/*/comments", route => {
      expect(route.request().method()).toBe("POST");
      sent.push({ id: new URL(route.request().url()).pathname.split("/")[3], content: route.request().postDataJSON().content });
      return route.fulfill({ json: { id: "saved-comment" } });
    });
    await page.route("**/api/questions/question-filter-weather", route => {
      expect(route.request().method()).toBe("DELETE");
      deleted.push("question-filter-weather");
      return route.fulfill({ json: { success: true } });
    });
    await page.goto("/teacher-questions");
    const checkbox = page.getByRole("checkbox", { name: "시험 학생: 날씨에 관한 시험 질문입니다.", exact: true }).filter({ visible: true });
    const actions = page.getByRole("group", { name: "선택한 질문 작업", exact: true });
    const panel = page.getByRole("region", { name: "인공지능 개별 맞춤 답변", exact: true });
    await checkbox.check();
    await expect(actions.getByText("질문 1개 선택됨", { exact: true })).toBeVisible();
    await expect(panel).toHaveCount(0);
    expect(generated).toEqual([]);
    expect(sent).toEqual([]);

    await actions.getByRole("button", { name: "맞춤 답변 작성", exact: true }).click();
    await expect(panel).toBeVisible();
    expect(generated).toEqual([]);
    await panel.getByRole("button", { name: "패널 닫기", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(checkbox).toBeChecked();
    await expect(actions.getByRole("button", { name: "맞춤 답변 작성", exact: true })).toBeFocused();
    // 패널을 닫은 뒤에도 같은 질문을 엑셀 다운로드와 수업 화면 보기에 활용한다.
    await page.getByRole("button", { name: "엑셀 다운로드", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("radio", { name: "선택한 질문 1개", exact: true })).toBeChecked();
    await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).click();
    await page.getByRole("button", { name: "수업 화면으로 보기", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("질문 1 / 1", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "수업 화면 닫기", exact: true }).click();

    await actions.getByRole("button", { name: "맞춤 답변 작성", exact: true }).click();
    await panel.evaluate(element => element.scrollIntoView({ block: "center" }));
    await expectNoHorizontalPageOverflow(page);
    await testInfo.attach(`맞춤-답변-패널-${width}`, { body: await page.screenshot({ path: testInfo.outputPath("answer-panel.png"), animations: "disabled" }), contentType: "image/png" });
    await panel.getByRole("button", { name: "답변 생성하기", exact: true }).click();
    const preview = page.getByRole("dialog");
    await expect(preview.getByRole("textbox")).toHaveValue("온도를 바꾸어 관찰하고 결과를 비교해 보세요.");
    expect(generated).toEqual(["question-filter-weather"]);
    expect(sent).toEqual([]);
    await preview.getByRole("textbox").fill("물의 양을 같게 하고 온도를 바꾸어 비교해 보세요.");
    await preview.getByRole("button", { name: "1개 답변 전송", exact: true }).click();
    await expect(preview).toHaveCount(0);
    expect(sent).toEqual([{ id: "question-filter-weather", content: "물의 양을 같게 하고 온도를 바꾸어 비교해 보세요." }]);
    await expect(actions).toHaveCount(0);

    // 전송 후 새로 선택하면 패널을 자동으로 다시 열지 않는다.
    await checkbox.check();
    await expect(panel).toHaveCount(0);
    await actions.getByRole("button", { name: "맞춤 답변 작성", exact: true }).click();
    await actions.getByRole("button", { name: "선택 해제", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await actions.getByRole("button", { name: "맞춤 답변 작성", exact: true }).click();
    await page.getByRole("button", { name: "열린 질문", exact: true }).click();
    await expect(actions).toHaveCount(0);
    await expect(panel).toHaveCount(0);
    await expect(checkbox).not.toBeChecked();

    // 삭제는 더보기 메뉴에서 시작하고 기존 확인 창을 거친다.
    await checkbox.check();
    await expect(page.getByRole("menuitem", { name: "선택한 질문 삭제", exact: true })).toHaveCount(0);
    await actions.getByRole("button", { name: "선택한 질문 더보기", exact: true }).click();
    await page.getByRole("menuitem", { name: "선택한 질문 삭제", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "취소", exact: true }).click();
    expect(deleted).toEqual([]);
    await expect(checkbox).toBeChecked();
    await actions.getByRole("button", { name: "선택한 질문 더보기", exact: true }).click();
    await page.getByRole("menuitem", { name: "선택한 질문 삭제", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true }).click();
    await expect(actions).toHaveCount(0);
    expect(deleted).toEqual(["question-filter-weather"]);
    expect(errors).toEqual([]);
  });
}

test("페이지·질문수업·탭을 바꾸면 선택과 맞춤 답변 패널을 초기화한다", async ({ page, baseURL }) => {
  const { errors } = await preparePage(page, "TEACHER", baseURL!);
  const rows = Array.from({ length: 31 }, (_, index) => ({
    id: `scope-question-${index}`, content: `증발에 관한 질문 ${index + 1}`, closure: "open", cognitive: "conceptual",
    sessionId: "filter-weather", session: { id: "filter-weather", date: "2026-09-06", subject: "과학", topic: "날씨" },
    author: { id: "student", name: "김질문" }, createdAt: "2026-09-06T00:00:00Z", isPublic: true, likeCount: 0, commentCount: 0,
  }));
  await page.route("**/api/questions?**", route => {
    const current = Number(new URL(route.request().url()).searchParams.get("page") || 1);
    return route.fulfill({ json: {
      items: rows.slice((current - 1) * 30, current * 30),
      pageInfo: { page: current, pageSize: 30, total: 31, totalPages: 2 },
      summary: { total: 31, closure: { closed: 0, open: 31 }, cognitive: { factual: 0, conceptual: 31, controversial: 0 }, flagged: 0 },
    } });
  });
  await page.goto("/teacher-questions");
  const actions = page.getByRole("group", { name: "선택한 질문 작업", exact: true });
  const panel = page.getByRole("region", { name: "인공지능 개별 맞춤 답변", exact: true });
  async function selectAndOpen() {
    await page.getByRole("checkbox").filter({ visible: true }).nth(1).check();
    await actions.getByRole("button", { name: "맞춤 답변 작성", exact: true }).click();
    await expect(panel).toBeVisible();
  }
  await selectAndOpen();
  await page.getByRole("button", { name: "다음 질문 페이지", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(actions).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await selectAndOpen();
  await page.getByRole("combobox", { name: "질문수업", exact: true }).selectOption("filter-weather");
  await expect(actions).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await page.getByRole("combobox", { name: "질문수업", exact: true }).selectOption("all");
  await selectAndOpen();
  await page.getByRole("button", { name: "🧩 탐구 설계", exact: true }).click();
  await expect(actions).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "🔎 전체 질문 탐구", exact: true }).click();
  await expect(page.getByRole("checkbox").filter({ visible: true }).nth(1)).not.toBeChecked();
  await page.getByRole("checkbox").filter({ visible: true }).nth(1).check();
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});
