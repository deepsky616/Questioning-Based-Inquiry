import { expect, test } from "@playwright/test";
import { preparePage } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";

// 화면은 실제 구현을 사용하며 인증·조회만 시험 응답으로 대체한다.
for (const width of [375, 768, 1440]) {
  test(`학생 ${width}픽셀에서 약속 학습과 질문 초안을 유지한다`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const { errors } = await preparePage(page, "STUDENT", baseURL!);
    const writes: string[] = [];
    page.on("request", request => {
      if (request.url().includes("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) writes.push(request.url());
    });
    await page.goto("/student-question-learning");
    for (let index = 0; index < 6; index++) await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByRole("tab", { name: "AI 사용 약속", exact: true }).click();
    await expect(page).toHaveURL(/#ai-ethics$/);
    await expect(page.getByRole("heading", { name: "질문 연구소에서 함께 지킬 약속" })).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("사용약속.png"), fullPage: true, animations: "disabled" });
    await page.getByRole("tab", { name: "질문 배우기", exact: true }).click();
    await expect(page.getByRole("tab", { name: "7 / 14", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "AI 사용 약속", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("tab", { name: "AI 사용 약속", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "상황 판단 연습", exact: true }).click();
    await expect(page.getByRole("heading", { name: "질문에 친구의 정보가 들어 있어요" })).toBeFocused();
    await page.getByRole("radio", { name: "친구의 정보를 자세히 입력한다." }).check();
    await expect(page.getByRole("status")).toContainText("친구를 알아볼 수 있는 정보");
    await expect(page.getByRole("button", { name: "다음 상황" })).toBeDisabled();
    await page.getByRole("radio", { name: "개인정보를 빼고 일반적인 질문으로 바꾼다." }).check();
    await page.getByRole("button", { name: "다음 상황" }).click();
    await page.getByRole("radio", { name: "내 질문의 뜻과 비교하고 도움이 되는 부분을 고른다." }).check();
    await page.getByRole("button", { name: "다음 상황" }).click();
    await page.getByRole("radio", { name: "친구의 질문에 내 생각과 이유를 덧붙인다." }).check();
    await page.getByRole("button", { name: "실천 약속 고르기" }).click();
    await page.getByRole("radio", { name: "도움받은 부분을 솔직히 밝혀요." }).check();
    await page.getByRole("button", { name: "내 약속 확인" }).click();
    await expect(page.getByRole("heading", { name: "오늘 실천할 나의 약속" })).toBeVisible();
    expect(writes).toEqual([]);

    await page.goto("/student-ask?sessionId=filter-weather");
    const input = page.getByRole("textbox", { name: "질문", exact: true });
    await input.fill("구름의 모양은 왜 달라질까요?");
    const trigger = page.getByRole("button", { name: "사용 약속 보기" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "질문 연구소 사용 약속" });
    await expect(dialog).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(input).toHaveValue("구름의 모양은 왜 달라질까요?");
    await page.getByRole("button", { name: "어두운 테마로 변경" }).click();
    await trigger.click();
    await expectNoHorizontalPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("사용약속-어두운화면.png"), fullPage: false, animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(input).toHaveValue("구름의 모양은 왜 달라질까요?");
    expect(errors).toEqual([]);
  });
}

test("교사가 짧은 화면에서도 약속 수업을 진행하고 원래 탭으로 돌아온다", async ({ page, baseURL }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const { errors } = await preparePage(page, "TEACHER", baseURL!);
  await page.goto("/teacher-question-learning#ai-ethics");
  const trigger = page.getByRole("button", { name: "약속 수업 화면으로 보기" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "함께 이야기하는 AI 사용 약속" });
  await expect(dialog.getByRole("button", { name: "이전 약속" })).toBeDisabled();
  for (let index = 0; index < 5; index++) {
    const next = dialog.getByRole("button", { name: "다음 약속" });
    await expect(next).toBeInViewport();
    await next.click();
  }
  await expect(dialog.getByRole("heading", { name: "문제가 생기면 멈추고 선생님께 알려요." })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "다음 약속" })).toBeDisabled();
  await expectNoHorizontalPageOverflow(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("교사용-약속수업.png"), fullPage: false, animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("tab", { name: "수업 활용", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI 사용 약속 · 첫 사용 전 20분 수업" })).toBeVisible();
  expect(errors).toEqual([]);
});
