import { loadEnvConfig } from "@next/env";
import { encode } from "next-auth/jwt";
import type { Page } from "@playwright/test";

// 인증과 자료 조회만 시험 응답으로 대체하고 화면·필터·주소 상태는 실제 구현을 사용한다.
export const sessions = [
  { id: "filter-weather", date: "2026-09-06", subject: "과학", topic: "날씨" },
  { id: "filter-region", date: "2026-08-01", subject: "사회", topic: "우리 지역" },
  { id: "filter-material", date: "2026-07-01", subject: "과학", topic: "물질" },
].map((session) => ({
  ...session, isActive: true, teacher: { name: "시험 선생님" },
  sharedQuestions: [], defaultQuestionPublic: false,
}));

export async function preparePage(page: Page, role: "STUDENT" | "TEACHER", baseURL: string) {
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
