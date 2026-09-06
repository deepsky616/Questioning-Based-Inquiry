import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import { expect, test, type Page } from "@playwright/test";

// 인증과 자료 조회만 시험 응답으로 대체하고 화면·필터·주소 상태는 실제 구현을 사용한다.
const sessions = [
  { id: "filter-weather", date: "2026-09-06", subject: "과학", topic: "날씨" },
  { id: "filter-region", date: "2026-08-01", subject: "사회", topic: "우리 지역" },
  { id: "filter-material", date: "2026-07-01", subject: "과학", topic: "물질" },
].map((session) => ({
  ...session, isActive: true, teacher: { name: "시험 선생님" },
  sharedQuestions: [], defaultQuestionPublic: false,
}));

async function preparePage(page: Page, role: "STUDENT" | "TEACHER", baseURL: string) {
  const { combinedEnv } = loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const secret = combinedEnv.AUTH_SECRET?.trim() || combinedEnv.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("시험용 인증 비밀값이 필요합니다");
  const user = {
    id: `filter-test-${role}`, role, name: "필터 시험", school: "시험 학교",
    grade: "4", className: "1", studentNumber: "1",
  };
  const token = await encode({
    token: { ...user, sub: user.id }, secret, salt: "authjs.session-token", maxAge: 3600,
  });
  await page.context().addCookies([{
    name: "authjs.session-token", value: token, url: baseURL, httpOnly: true, sameSite: "Lax",
  }]);
  const errors: string[] = [];
  const questionRequests: URLSearchParams[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname === "/api/auth/session") {
      data = { user, expires: new Date(Date.now() + 3600000).toISOString() };
    } else if (url.pathname === "/api/sessions") {
      data = sessions;
    } else if (url.pathname === "/api/notifications") {
      data = { notifications: [], unreadCount: 0, unreadSessionReminders: [] };
    } else if (url.pathname === "/api/config") {
      data = { configured: true };
    } else if (url.pathname === "/api/questions" && url.searchParams.get("view") === "dashboard") {
      data = {
        recent: [], answeredSessionIds: [],
        stats: { total: 0, byClosure: { closed: 0, open: 0 }, byCognitive: { factual: 0, conceptual: 0, controversial: 0 } },
      };
    } else if (url.pathname === "/api/questions" && url.searchParams.get("view") === "student-session") {
      data = { existingQuestion: null };
    } else if (url.pathname === "/api/questions" && url.searchParams.get("view") === "page") {
      questionRequests.push(url.searchParams);
      const matches = sessions.filter((session) =>
        ["date", "subject", "topic"].every((key) => !url.searchParams.has(key) ||
          session[key as "date" | "subject" | "topic"] === url.searchParams.get(key)) &&
        (!url.searchParams.has("sessionId") || session.id === url.searchParams.get("sessionId")),
      );
      const items = matches.map((session) => ({
        id: `question-${session.id}`, content: `${session.topic}에 관한 시험 질문입니다.`,
        closure: "open", cognitive: "conceptual", closureScore: 0.2, cognitiveScore: 0.8,
        sessionId: session.id, session, author: { id: "student", name: "시험 학생" },
        isPublic: true, createdAt: `${session.date}T00:00:00Z`, likeCount: 0, commentCount: 0,
      }));
      data = {
        items, pageInfo: { page: 1, pageSize: 30, total: items.length, totalPages: 1 },
        summary: { total: items.length, closure: { closed: 0, open: items.length },
          cognitive: { factual: 0, conceptual: items.length, controversial: 0 }, flagged: 0 },
      };
    } else if (url.pathname.endsWith("/design-context")) {
      data = { context: null };
    } else if (url.pathname.endsWith("/analysis")) {
      data = { analysis: null };
    } else if (url.pathname === "/api/teacher/flagged-count" || url.pathname === "/api/teacher/points/pending-count") {
      data = { count: 0 };
    } else {
      errors.push(`예상하지 않은 자료 요청: ${url.pathname}`);
      await route.fulfill({ status: 404, json: {} });
      return;
    }
    await route.fulfill({ json: data });
  });
  return { errors, questionRequests };
}

test.describe("학생 질문하기 필터", () => {
  test("맞는 수업이 없는 조합에서 전체로 돌아와도 화면과 초안을 유지한다", async ({ page, baseURL }) => {
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
    await date.selectOption("2026-08-01");
    await expect(session).toBeDisabled();
    await expect(session).toHaveValue("");
    await expect(page).not.toHaveURL(/sessionId=/);
    await date.selectOption("");
    await subject.selectOption("");
    await topic.selectOption("");
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
  test(`${role === "STUDENT" ? "학생" : "교사"} 필터를 조합하고 전체로 해제하면 조건에 맞는 결과만 표시한다`, async ({ page, baseURL }) => {
    const { errors } = await preparePage(page, role, baseURL!);
    await page.goto(role === "STUDENT" ? "/student-ask" : "/teacher-questions");
    const labels = role === "STUDENT"
      ? ["날짜로 거르기", "교과로 거르기", "주제(단원)로 거르기"]
      : ["날짜", "교과", "주제(단원)"];
    const controls = labels.map((name) => page.getByRole("combobox", { name, exact: true }));
    await expect(controls[0]).toBeVisible();
    let previous = ["", "", ""];
    const cases: Array<[string, string, string, number]> = [
      ["", "", "", 3],
      ["2026-08-01", "", "", 1],
      ["2026-08-01", "과학", "", 0],
      ["2026-08-01", "과학", "날씨", 0],
      ["", "과학", "날씨", 1],
      ["", "", "날씨", 1],
      ["2026-08-01", "", "날씨", 0],
      ["", "과학", "", 2],
      ["", "", "", 3],
    ];
    for (const [date, subject, topic, count] of cases) {
      const values = [date, subject, topic];
      for (let index = 0; index < values.length; index += 1) {
        if (values[index] === previous[index]) continue;
        if (role === "STUDENT" || index === 0) await controls[index].selectOption(values[index]);
        else {
          await controls[index].click();
          await page.getByRole("option", {
            name: values[index] || (index === 1 ? "전체 교과" : "전체 주제(단원)"), exact: true,
          }).click();
        }
      }
      previous = values;
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
