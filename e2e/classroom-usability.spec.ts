import { expect, test } from "@playwright/test";
import { preparePage } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";

for (const theme of ["light", "dark"] as const) {
  test(`${theme} 성장 기록의 미저장 내용을 닫기·새로고침 후 복원하고 저장하면 초안을 정리한다`, async ({ page, baseURL }) => {
    const { errors } = await preparePage(page, "STUDENT", baseURL!);
    await page.setViewportSize({ width: theme === "light" ? 375 : 1440, height: 1024 });
    await page.addInitScript(value => localStorage.setItem("question-lab-theme", value), theme);
    const note = "비교할 조건을 더 자세히 썼어요.";
    const reflection = "온도 외에 물의 양도 같게 해야 해요.";
    let writes = 0;
    let record = { questionId: "draft-q", originalContent: "소금이 녹을까요?", revisedContent: "물의 온도에 따라 녹는 양은 어떻게 달라질까요?", changeNote: "", reflection: "", revision: 1, updatedAt: new Date().toISOString() };
    await page.route("**/api/questions?**", route => route.fulfill({ json: [{ id: record.questionId, content: record.revisedContent, closure: "open", cognitive: "conceptual", isPublic: true, createdAt: record.updatedAt, likeCount: 0, commentCount: 0, session: null, growthComplete: Boolean(record.changeNote && record.reflection) }] }));
    await page.route("**/api/question-growth**", route => {
      if (route.request().method() === "PUT") {
        expect(route.request().postDataJSON()).toEqual({ questionId: record.questionId, revision: 1, changeNote: note, reflection });
        writes++;
        record = { ...record, changeNote: note, reflection, revision: 2 };
        return route.fulfill({ json: { saved: true } });
      }
      return route.fulfill({ json: { questions: [{ id: record.questionId, content: record.revisedContent, session: null }], records: [record], canEdit: true } });
    });
    await page.goto("/student-questions?tab=mine&growth=draft-q");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "질문을 만들거나 고친 점", exact: true }).fill(note);
    await dialog.getByRole("textbox", { name: "탐구하며 알게 된 점", exact: true }).fill(reflection);
    await expect(dialog.getByText(/이 브라우저에 임시 보관했어요/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.getByRole("link", { name: "성장 기록 이어쓰기", exact: true }).filter({ visible: true }).click();
    await expect(dialog.getByRole("textbox", { name: "질문을 만들거나 고친 점", exact: true })).toHaveValue(note);
    await page.reload();
    await expect(dialog.getByRole("textbox", { name: "탐구하며 알게 된 점", exact: true })).toHaveValue(reflection);
    expect(writes).toBe(0);
    await dialog.getByRole("button", { name: "성장 기록 저장", exact: true }).click();
    await expect(dialog.getByText("성장 기록을 저장했어요.", { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("question-lab:growth-draft:")))).toEqual([]);
    await expectNoHorizontalPageOverflow(page);
    expect(errors).toEqual([]);
  });

  test(`${theme} 교사가 분류 이유를 저장하고 이력을 확인하며 선택한 질문만 수업 화면에 표시한다`, async ({ page, baseURL }, testInfo) => {
    const { errors } = await preparePage(page, "TEACHER", baseURL!);
    await page.setViewportSize({ width: theme === "light" ? 1440 : 375, height: 900 });
    await page.addInitScript(value => localStorage.setItem("question-lab-theme", value), theme);
    const reason = "여러 조건의 관계를 묻는 질문이라 개념적 질문으로 확인했어요.";
    let saved = false;
    // 공통 시험 응답의 실제 질문 목록 UI를 사용하고 변경 요청만 대체한다.
    await page.route("**/api/questions/question-filter-weather", route => {
      expect(route.request().method()).toBe("PATCH");
      expect(route.request().postDataJSON()).toEqual({ closure: "open", cognitive: "conceptual", reviewReason: reason });
      saved = true;
      return route.fulfill({ json: { id: "question-filter-weather" } });
    });
    await page.route("**/api/questions/*/classification-reviews?**", route => route.fulfill({ json: { records: saved ? [{ id: "review-1", previousClosure: "open", previousCognitive: "conceptual", closure: "open", cognitive: "conceptual", reason, createdAt: "2026-09-09T01:00:00.000Z", reviewer: { name: "시험 선생님" } }] : [], page: 1, hasMore: false } }));
    await page.goto("/teacher-questions");
    await page.getByRole("button", { name: "수정", exact: true }).filter({ visible: true }).first().click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "분류 확인·수정 이유 (선택)" }).fill(reason);
    await dialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(saved).toBe(true);
    await page.getByRole("button", { name: "분류 확인 이력", exact: true }).filter({ visible: true }).first().click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByText(reason, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "이 페이지 질문으로 수업 화면 보기", exact: true }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByText("질문 1 / 3", { exact: true })).toBeVisible();
    await expect(dialog.getByText("시험 학생", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("열린 질문 · 개념적 질문", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "분류·설명 공개", exact: true }).click();
    await expect(dialog.getByText("열린 질문 · 개념적 질문", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "학생 이름 표시", exact: true }).click();
    await expect(dialog.getByText("시험 학생", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "다음 질문", exact: true }).click();
    await expect(dialog.getByText("열린 질문 · 개념적 질문", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("우리 지역에 관한 시험 질문입니다.", { exact: true })).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeCloseTo(0, 0);
    expect(box!.y).toBeCloseTo(0, 0);
    expect(box!.height).toBeCloseTo(900, 0);
    await expectNoHorizontalPageOverflow(page);
    await testInfo.attach(`수업-화면-${theme}`, { body: await page.screenshot({ path: testInfo.outputPath(`presentation-${theme}.png`) }), contentType: "image/png" });
    await dialog.getByRole("button", { name: "수업 화면 닫기", exact: true }).click();
    await page.getByRole("checkbox").filter({ visible: true }).nth(2).check();
    await page.getByRole("button", { name: "선택한 질문으로 수업 화면 보기", exact: true }).click();
    await expect(dialog.getByText("질문 1 / 1", { exact: true })).toBeVisible();
    await expect(dialog.getByText("우리 지역에 관한 시험 질문입니다.", { exact: true })).toBeVisible();
    await expect(dialog.getByText("시험 학생", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "다음 질문", exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
  });
}
