import { expect, test, type Locator, type Page } from "@playwright/test";
import { preparePage, sessions } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";

const draftQuestion = "물질의 성질을 어떻게 비교할 수 있을까요?";
const sharedQuestion = (content: string) => ({
  type: "conceptual", content, source: "teacher" as const, contentGroup: "탐구",
  priority: 1, lessonPhase: "탐구", publishedAt: "2026-09-06T00:00:00Z",
});

async function prepareDesign(page: Page, baseURL: string, failAt?: "settings" | "publish") {
  const { errors } = await preparePage(page, "TEACHER", baseURL);
  let records = sessions.map((session, index) => ({
    ...session,
    unitDesignId: index === 2 ? "linked-inquiry-design" : null,
    sharedQuestions: index < 2 ? [sharedQuestion(`${session.topic}에 관한 배포 질문`)] : [],
  }));
  const writes: string[] = [];
  let failure = failAt;
  await page.route("**/api/sessions", route => route.fulfill({ json: records }));
  await page.route("**/api/teacher/students**", route => route.fulfill({ json: { students: [], teacherClasses: [] } }));
  await page.route("**/api/sessions/*", route => {
    writes.push("settings");
    return route.fulfill({ status: failure === "settings" ? 503 : 200, json: {} });
  });
  await page.route("**/api/sessions/*/publish-questions", route => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split("/")[3];
    writes.push(request.method() === "DELETE" ? "delete" : "publish");
    if (failure === "publish") return route.fulfill({ status: 503, json: {} });
    records = records.map(session => session.id === id ? {
      ...session,
      sharedQuestions: request.method() === "DELETE" ? [] : request.postDataJSON().sequence.map((question: {content: string}) => sharedQuestion(question.content)),
    } : session);
    return route.fulfill({ json: { publishedAt: "2026-09-07T00:00:00Z" } });
  });
  return { errors, writes, recover: () => { failure = undefined; } };
}

function panels(page: Page) {
  return {
    editor: page.getByRole("region", { name: "질문 중심 탐구설계", exact: true }),
    list: page.getByRole("region", { name: "배포한 탐구설계", exact: true }),
  };
}

async function addDraft(editor: Locator) {
  await editor.getByPlaceholder("교사 추가 질문을 입력하고 ‘추가’를 누르세요").fill(draftQuestion);
  await editor.getByRole("button", { name: "③ 추가", exact: true }).click();
  await expect(editor.getByText(draftQuestion, { exact: true })).toBeVisible();
}

test("배포한 수업은 작성 패널을 접고 목록 필터와 관계없이 배포 상태를 유지한다", async ({ page, baseURL }, testInfo) => {
  const { errors } = await prepareDesign(page, baseURL!);
  await page.goto(`/teacher-questions?tab=design&session=${sessions[0].id}`);
  const { editor, list } = panels(page);
  await expect(editor.getByRole("button", { name: "배포한 설계 보기" })).toBeVisible();
  await expect(editor.getByPlaceholder("교사 추가 질문을 입력하고 ‘추가’를 누르세요")).toHaveCount(0);
  await list.getByRole("combobox", { name: "날짜", exact: true }).selectOption(sessions[1].date);
  await expect(list.locator(`[data-session-id="${sessions[0].id}"]`)).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "배포한 설계 보기" })).toBeVisible();
  await editor.getByRole("button", { name: "배포한 설계 보기" }).click();
  const entry = list.locator(`[data-session-id="${sessions[0].id}"]`);
  await expect(entry.getByRole("button", { name: /2026-09-06/ })).toHaveAttribute("aria-expanded", "true");
  await expect(entry.getByRole("button", { name: /2026-09-06/ })).toBeFocused();
  await expect(list.getByRole("combobox", { name: "날짜", exact: true })).toHaveValue("");
  await entry.getByRole("button", { name: "수정", exact: true }).click();
  await expect(entry.getByText("날씨에 관한 배포 질문", { exact: true })).toBeVisible();
  await entry.getByRole("button", { name: "⑤ 학생에게 배포", exact: true }).click();
  await expect(entry.getByRole("button", { name: "⑤ 학생에게 배포", exact: true })).toHaveCount(0);
  await expect(entry.getByRole("button", { name: /2026-09-06/ })).toHaveAttribute("aria-expanded", "true");
  await expectNoHorizontalPageOverflow(page);
  await page.getByRole("button", { name: "어두운 테마로 변경" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectNoHorizontalPageOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("배포설계-어두운화면.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("미배포 수업은 작성 패널을 열고 배포·전체 삭제 후 해당 수업의 화면을 전환한다", async ({ page, baseURL }, testInfo) => {
  const { errors } = await prepareDesign(page, baseURL!);
  await page.goto(`/teacher-questions?tab=design&session=${sessions[2].id}`);
  const { editor, list } = panels(page);
  await addDraft(editor);
  await editor.getByRole("button", { name: "⑤ 학생에게 배포", exact: true }).click();
  await expect(editor.getByRole("button", { name: "배포한 설계 보기" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`session=${sessions[2].id}`));
  const entry = list.locator(`[data-session-id="${sessions[2].id}"]`);
  await expect(entry.getByRole("button", { name: /2026-07-01/ })).toBeFocused();
  await expect(entry.getByText(draftQuestion, { exact: true })).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("배포완료-밝은화면.png"), fullPage: true });
  await entry.getByRole("button", { name: "삭제", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true }).click();
  await expect(editor.getByPlaceholder("교사 추가 질문을 입력하고 ‘추가’를 누르세요")).toBeVisible();
  await expect(editor.getByRole("button", { name: "⑤ 학생에게 배포", exact: true })).toBeDisabled();
  await expect(entry).toHaveCount(0);
  // 다른 수업의 배포 자료가 남아 있어도 선택한 수업은 새로 작성할 수 있다.
  await expect(list).toBeVisible();
  expect(errors).toEqual([]);
});

for (const failAt of ["settings", "publish"] as const) {
  test(`${failAt === "settings" ? "설정 저장" : "배포"} 실패 시 작성 내용을 유지하고 다시 배포할 수 있다`, async ({ page, baseURL }) => {
    const { errors, writes, recover } = await prepareDesign(page, baseURL!, failAt);
    await page.goto(`/teacher-questions?tab=design&session=${sessions[2].id}`);
    const { editor } = panels(page);
    await addDraft(editor);
    await editor.getByRole("button", { name: "⑤ 학생에게 배포", exact: true }).click();
    await expect(editor.getByText("배포에 실패했습니다", { exact: true })).toBeVisible();
    await expect(editor.getByText(draftQuestion, { exact: true })).toBeVisible();
    await expect(editor.getByRole("button", { name: "배포한 설계 보기" })).toHaveCount(0);
    expect(writes).toEqual(failAt === "settings" ? ["settings"] : ["settings", "publish"]);
    recover();
    await editor.getByRole("button", { name: "⑤ 학생에게 배포", exact: true }).click();
    await expect(editor.getByRole("button", { name: "배포한 설계 보기" })).toBeVisible();
    expect(errors.filter(error => !error.includes("503"))).toEqual([]);
  });
}
