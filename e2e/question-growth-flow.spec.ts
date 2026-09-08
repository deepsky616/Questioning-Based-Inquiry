import { expect, test } from "@playwright/test";
import { preparePage } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";

for (const theme of ["light", "dark"] as const) {
  test(`${theme === "light" ? "밝은" : "어두운"} 화면에서 분석·다듬기·질문 저장·한 줄 돌아보기를 이어 간다`, async ({ page, baseURL }, testInfo) => {
    const { errors } = await preparePage(page, "STUDENT", baseURL!);
    await page.setViewportSize({ width: theme === "light" ? 375 : 1440, height: 900 });
    await page.addInitScript(value => { localStorage.setItem("question-lab-theme", value); }, theme);
    const original = "소금이 물에 녹을까요?";
    const revised = "물의 온도에 따라 소금이 녹는 양은 어떻게 달라질까요?";
    const note = "비교할 조건을 질문에 넣었어요.";
    const requests: Record<string, unknown>[] = [];
    let record = { questionId: "growth-q", originalContent: original, revisedContent: revised, changeNote: "", reflection: "", revision: 1, updatedAt: new Date().toISOString() };
    await page.route("**/api/classify", route => route.fulfill({ json: { closure: "open", cognitive: "conceptual", closureScore: 0.8, cognitiveScore: 0.8, reasoning: "두 조건을 비교하는 질문이에요.", feedback: "비교할 조건을 살펴보세요.", analysisSource: "ai" } }));
    await page.route("**/api/questions", route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: "growth-q", awardedPoints: 2, growthRecorded: true } });
    });
    await page.route("**/api/question-growth**", async route => {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        expect(body).toEqual({ questionId: "growth-q", revision: 1, changeNote: note });
        record = { ...record, changeNote: body.changeNote, revision: 2 };
        return route.fulfill({ json: { saved: true } });
      }
      return route.fulfill({ json: { questions: [{ id: "growth-q", content: revised, session: null }], records: [record], canEdit: true } });
    });
    await page.route("**/api/points**", route => route.fulfill({ json: { totalPoints: 2 } }));
    await page.goto("/student-ask?sessionId=filter-weather");
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark).*$/);
    const input = page.getByLabel("질문", { exact: true });
    await input.fill(original);
    await page.getByRole("button", { name: "질문 분석하기", exact: true }).click();
    await expect(page.getByRole("heading", { name: "분석 결과", exact: true })).toBeVisible();
    await input.fill(revised);
    await expect(page.getByRole("button", { name: "질문 저장", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "다시 분석", exact: true }).click();
    await expect(page.getByRole("button", { name: "질문 저장", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "질문 저장", exact: true }).click();
    await expect(page.getByText("질문이 저장되었습니다", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ content: revised, growth: { originalContent: original } });
    await page.getByRole("button", { name: "한 줄 남기기", exact: true }).click();
    await page.getByRole("textbox", { name: /한 줄 돌아보기/ }).fill(note);
    await expect(page.getByRole("textbox", { name: /새롭게 알게 된 점/ })).toHaveCount(0);
    await page.getByRole("button", { name: "성장 기록 저장", exact: true }).click();
    await expect(page.getByText("성장 기록을 저장했어요.", { exact: true })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    await testInfo.attach(`growth-${theme}`, { body: await page.screenshot({ fullPage: true, path: testInfo.outputPath(`growth-${theme}.png`) }), contentType: "image/png" });
    expect(errors).toEqual([]);
  });
}

for (const width of [768, 1440]) {
test(`${width} 화면의 나의 질문에서 배운 점을 이어 쓰고 기존 돌아보기를 보존한다`, async ({ page, baseURL }, testInfo) => {
  const { errors } = await preparePage(page, "STUDENT", baseURL!);
  await page.setViewportSize({ width, height: 1024 });
  let record = { questionId: "growth-old", originalContent: "소금이 녹을까?", revisedContent: "온도에 따라 녹는 양은 어떻게 달라질까?", changeNote: "온도를 비교하기로 했어요.", reflection: "", revision: 1, updatedAt: new Date().toISOString() };
  await page.route("**/api/questions?**", route => route.fulfill({ json: [{ id: record.questionId, content: record.revisedContent, closure: "open", cognitive: "conceptual", isPublic: true, createdAt: record.updatedAt, likeCount: 2, commentCount: 1, session: null }] }));
  await page.route("**/api/question-growth**", route => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      expect(body).toEqual({ questionId: record.questionId, revision: 1, reflection: "물의 양을 같게 해야 공정하게 비교할 수 있어요." });
      record = { ...record, reflection: body.reflection, revision: 2 };
      return route.fulfill({ json: { saved: true } });
    }
    return route.fulfill({ json: { questions: [{ id: record.questionId, content: record.revisedContent, session: null }], records: [record], canEdit: true } });
  });
  await page.goto("/student-questions?tab=mine");
  const growthLink = page.getByRole("link", { name: "성장 기록 이어쓰기", exact: true }).filter({ visible: true });
  await expect(growthLink).toHaveCount(1);
  await growthLink.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /한 줄 돌아보기/ })).toHaveValue(record.changeNote);
  await dialog.getByRole("textbox", { name: /새롭게 알게 된 점/ }).fill("물의 양을 같게 해야 공정하게 비교할 수 있어요.");
  await dialog.getByRole("button", { name: "성장 기록 저장", exact: true }).click();
  await expect(dialog.getByText("성장 기록을 저장했어요.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /한 줄 돌아보기/ })).toHaveValue(record.changeNote);
  await expectNoHorizontalPageOverflow(page);
  await testInfo.attach(`growth-editor-${width}`, { body: await page.screenshot({ path: testInfo.outputPath(`growth-editor-${width}.png`) }), contentType: "image/png" });
  expect(errors).toEqual([]);
});
}
