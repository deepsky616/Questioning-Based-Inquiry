import { expect, test } from "@playwright/test";
import { preparePage, sessions } from "./helpers/session-filter-page";

test.describe("학생 질문하기 필터", () => {
  test("관련 없는 조건을 제외하고 전체로 돌아와도 화면과 초안을 유지한다", async ({ page, baseURL }) => {
    const { errors } = await preparePage(page, "STUDENT", baseURL!);
    await page.goto("/student-ask?sessionId=filter-weather");
    const input = page.getByLabel("질문", { exact: true });
    const date = page.getByRole("combobox", { name: "날짜로 거르기" });
    const subject = page.getByRole("combobox", { name: "교과로 거르기" });
    const topic = page.getByRole("combobox", { name: "주제(단원)로 거르기" });
    const session = page.locator("#session");
    await expect(session).toHaveValue("filter-weather");
    await input.fill("구름은 왜 모양이 달라질까요?");
    await subject.selectOption("과학");
    await topic.selectOption("날씨");
    await expect(date.locator('option[value="2026-08-01"]')).toHaveCount(0);
    await expect(session).toHaveValue("filter-weather");
    const search = page.getByRole("searchbox");
    await search.fill("목록에 없는 수업");
    await expect(session).toBeDisabled();
    await expect(page).not.toHaveURL(/sessionId=/);
    await date.selectOption("");
    await subject.selectOption("");
    await topic.selectOption("");
    await search.fill("");
    await expect(session).toBeEnabled();
    await expect(session.locator("option")).toHaveCount(3);
    await expect(session).toHaveValue("filter-weather");
    await expect(input).toHaveValue("구름은 왜 모양이 달라질까요?");
    expect(errors).toEqual([]);
  });

  test("검색 결과가 비어도 검색을 지워 복구하고 다른 수업 주소를 복원한다", async ({ page, baseURL }) => {
    const { errors } = await preparePage(page, "STUDENT", baseURL!);
    await page.goto("/student-ask?sessionId=filter-region");
    await expect(page.locator("#session")).toHaveValue("filter-region");
    const search = page.getByRole("searchbox");
    await search.fill("목록에 없는 수업");
    await expect(page.locator("#session")).toBeDisabled();
    await search.fill("");
    await expect(page.locator("#session")).toBeEnabled();
    await page.locator("#session").selectOption("filter-material");
    await expect(page).toHaveURL(/sessionId=filter-material/);
    await page.reload();
    await expect(page.locator("#session")).toHaveValue("filter-material");
    expect(errors).toEqual([]);
  });
});

for (const [key, label, value, allLabel] of [
  ["date", "날짜", "2026-09-06", "전체 날짜"],
  ["subject", "교과", "과학", "전체 교과"],
  ["topic", "주제(단원)", "날씨", "전체 주제(단원)"],
] as const) {
  test(`교사 ${allLabel} 선택은 이전 수업 제한을 해제하고 전체 질문을 조회한다`, async ({ page, baseURL }) => {
    const { errors, questionRequests } = await preparePage(page, "TEACHER", baseURL!);
    const params = new URLSearchParams({ session: "filter-weather", [key]: value });
    await page.goto(`/teacher-questions?${params}`);
    const session = page.getByRole("combobox", { name: "질문수업", exact: true });
    await expect(session).toHaveValue("filter-weather");
    await expect.poll(() => questionRequests.length).toBeGreaterThan(0);
    const control = page.getByRole("combobox", { name: label, exact: true });
    if (key === "date") await control.selectOption("");
    else {
      await control.click();
      await page.getByRole("option", { name: allLabel, exact: true }).click();
    }
    await expect(session).toHaveValue("all");
    await expect.poll(() => questionRequests.at(-1)?.has("sessionId")).toBe(false);
    for (const content of ["날씨", "우리 지역", "물질"]) {
      await expect(page.getByText(`${content}에 관한 시험 질문입니다.`, { exact: true }).filter({ visible: true })).toBeVisible();
    }
    await expect(page).toHaveURL(/\/teacher-questions$/);
    expect(errors).toEqual([]);
  });
}

for (const role of ["STUDENT", "TEACHER"] as const) {
  for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
    test(`${role === "STUDENT" ? "학생" : "교사"} ${order.map((index) => ["날짜", "교과", "주제"][index]).join(" → ")} 순서로 연동하고 전체로 복구한다`, async ({ page, baseURL }) => {
      const { errors } = await preparePage(page, role, baseURL!);
      await page.goto(role === "STUDENT" ? "/student-ask" : "/teacher-questions");
      const labels = role === "STUDENT"
        ? ["날짜로 거르기", "교과로 거르기", "주제(단원)로 거르기"]
        : ["날짜", "교과", "주제(단원)"];
      const controls = labels.map((name) => page.getByRole("combobox", { name, exact: true }));
      await expect(controls[0]).toBeVisible();
      const keys = ["date", "subject", "topic"] as const;
      const allLabels = ["전체 날짜", "전체 교과", "전체 주제(단원)"];
      const selected = ["", "", ""];
      const target = ["2026-09-06", "과학", "날씨"];

      async function verifyOptions() {
        for (let index = 0; index < 3; index += 1) {
          const matching = sessions.filter((session) => keys.every((key, other) =>
            other === index || !selected[other] || session[key] === selected[other],
          ));
          const expected = [...new Set(matching.map((session) => session[keys[index]]))].sort();
          if (index === 0) expected.reverse();
          if (role === "STUDENT" || index === 0) {
            await expect.poll(() => controls[index].locator("option").evaluateAll((options) =>
              options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
            )).toEqual(expected);
          } else {
            await controls[index].click();
            await expect(page.getByRole("option").filter({ visible: true })).toHaveText([allLabels[index], ...expected]);
            await page.keyboard.press("Escape");
          }
        }
      }

      await verifyOptions();
      for (const [index, value] of [...order.map((index) => [index, target[index]] as const), ...order.map((index) => [index, ""] as const)]) {
        if (role === "STUDENT" || index === 0) {
          await controls[index].selectOption(value);
          await expect(controls[index]).toHaveValue(value);
        } else {
          await controls[index].click();
          await page.getByRole("option", {
            name: value || allLabels[index], exact: true,
          }).click();
          await expect(controls[index]).toHaveText(value || allLabels[index]);
        }
        selected[index] = value;
        await verifyOptions();
        const count = sessions.filter((session) => keys.every((key, index) => !selected[index] || session[key] === selected[index])).length;
        if (role === "STUDENT") {
          const session = page.locator("#session");
          if (count === 0) await expect(session).toBeDisabled();
          else {
            await expect(session).toBeEnabled();
            await expect(session.locator("option")).toHaveCount(count);
          }
        } else {
          await expect(page.getByText(/에 관한 시험 질문입니다\./).filter({ visible: true })).toHaveCount(count);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}
