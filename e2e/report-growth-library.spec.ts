import { expect, test } from "@playwright/test";
import { preparePage } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";

const lessons = [
  { id: "growth-science", date: "2026-09-01", subject: "과학", topic: "용해와 용액", analysis: { summary: "온도를 비교하는 질문을 잘 만들었어요." } },
  { id: "growth-math", date: "2026-09-02", subject: "수학", topic: "약수와 배수", analysis: null },
];
const student = { id: "growth-student", name: "김질문", grade: "5", className: "1", studentNumber: "1" };
const report = {
  student, sessions: lessons, totals: { questions: 17, likesGiven: 1, comments: 1, likesReceived: 1, commentsReceived: 1 },
  weekly: [], monthly: [], classification: { total: 17, closure: { closed: 7, open: 10 }, cognitive: { factual: 7, conceptual: 10, controversial: 0 } },
};
const records = Array.from({ length: 17 }, (_, i) => ({
  questionId: `growth-${i}`, originalContent: `처음 작성한 질문 ${i + 1}`, revisedContent: `다듬은 나의 질문 ${i + 1}`,
  changeNote: "비교할 조건을 넣었어요.", reflection: i % 2 ? "조건을 같게 해야 비교할 수 있어요." : "", revision: 1,
  updatedAt: "2026-09-08T00:00:00Z", question: { session: lessons[i % 2] },
}));

for (const role of ["STUDENT", "TEACHER"] as const) {
  test(`${role === "STUDENT" ? "학생" : "교사"} 리포트는 수업별 기록과 맨 하단의 검색·페이지 목록을 연결한다`, async ({ page, baseURL }, testInfo) => {
    const { errors } = await preparePage(page, role, baseURL!);
    await page.setViewportSize({ width: role === "STUDENT" ? 375 : 1440, height: 900 });
    const seenSessions: string[] = [];
    await page.addInitScript(theme => localStorage.setItem("question-lab-theme", theme), role === "TEACHER" ? "dark" : "light");
    await page.route("**/api/reports/**", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/reports/class") return route.fulfill({ json: url.searchParams.has("grade") ? { ...report, klass: { grade: "5", className: "1", studentCount: 1 }, perStudent: [{ ...student, questions: 17, likesGiven: 1, comments: 1 }] } : { classes: [{ grade: "5", className: "1", studentCount: 1 }] } });
      return route.fulfill({ json: report });
    });
    await page.route("**/api/stats?**", route => route.fulfill({ json: { total: 17, byClosure: { closed: 7, open: 10 }, byCognitive: { factual: 7, conceptual: 10, controversial: 0 }, byStudent: [], timeline: [], teacherClasses: [{ grade: "5", className: "1" }] } }));
    await page.route("**/api/teacher/students?**", route => route.fulfill({ json: { students: [student], teacherClasses: [{ grade: "5", className: "1" }], activity: [] } }));
    await page.route("**/api/points/**", route => route.fulfill({ json: { students: [], total: 0, totalPoints: 0 } }));
    await page.route("**/api/question-growth**", route => {
      const url = new URL(route.request().url());
      const sessionId = url.searchParams.get("sessionId");
      if (sessionId) seenSessions.push(sessionId);
      const scoped = records.filter(record => !sessionId || record.question.session.id === sessionId);
      const q = url.searchParams.get("q") || "";
      const status = url.searchParams.get("status");
      const matches = scoped.filter(record => record.revisedContent.includes(q) && (status === "pending" ? !record.reflection : status === "complete" ? Boolean(record.reflection) : true));
      const totalPages = Math.max(1, Math.ceil(matches.length / 8));
      const current = Math.min(Number(url.searchParams.get("page") || 1), totalPages);
      return route.fulfill({ json: { records: matches.slice((current - 1) * 8, current * 8), canEdit: role === "STUDENT", pageInfo: { page: current, pageSize: 8, total: matches.length, totalPages }, summary: { total: scoped.length, complete: scoped.filter(row => row.reflection).length, pending: scoped.filter(row => !row.reflection).length } } });
    });
    await page.goto(role === "STUDENT" ? "/student-dashboard?tab=reports" : "/teacher-reports");
    if (role === "TEACHER") await page.getByRole("button", { name: "학생별", exact: true }).click();
    const analysis = page.locator(".report-analysis-panel");
    const library = page.locator("#question-growth-library");
    await expect(library.getByRole("heading", { name: "나의 질문 성장 기록 모아보기" })).toBeVisible();
    expect(await library.evaluate((node) => Boolean(node.compareDocumentPosition(document.querySelector(".report-analysis-panel")!) & Node.DOCUMENT_POSITION_PRECEDING))).toBe(true);
    // 수업을 펼치기 전에는 수업별 기록을 별도로 요청하지 않는다.
    expect(seenSessions).toEqual([]);
    await analysis.getByRole("button", { name: /용해와 용액/ }).click();
    const lessonGrowth = analysis.getByRole("region", { name: "이 수업의 질문 성장 기록" });
    await expect(lessonGrowth.locator("article")).toHaveCount(8);
    await expect(lessonGrowth).not.toContainText("약수와 배수");
    expect(seenSessions).toContain("growth-science");
    await analysis.getByRole("button", { name: /약수와 배수/ }).click();
    await expect(analysis.getByRole("region", { name: "이 수업의 질문 성장 기록" }).nth(1).locator("article")).toHaveCount(8);
    // 분석 결과가 없는 수업도 성장 기록은 별도로 볼 수 있다.
    expect(seenSessions).toContain("growth-math");
    await expect(library.locator("article")).toHaveCount(8);
    await library.getByRole("button", { name: "다음 기록" }).click();
    await expect(library).toContainText("2 / 3쪽");
    await library.getByRole("searchbox").fill("질문 17");
    await library.getByRole("button", { name: "검색", exact: true }).click();
    await expect(library.locator("article")).toHaveCount(1);
    await expect(library.locator("summary")).toContainText("다듬은 나의 질문 17");
    await library.getByRole("button", { name: /배운 점 작성 완료/ }).click();
    await expect(library.getByText("조건에 맞는 성장 기록이 없어요.")).toBeVisible();
    await library.getByRole("button", { name: "전체 기록 보기", exact: true }).click();
    await expect(library.locator("article")).toHaveCount(8);
    await library.getByRole("searchbox").fill("질문 17");
    await library.getByRole("button", { name: "검색", exact: true }).click();
    await expect(library.locator("article")).toHaveCount(1);
    await library.locator("summary").click();
    await expect(library.getByText("비교할 조건을 넣었어요.", { exact: true })).toBeVisible();
    const editLink = library.getByRole("link", { name: "성장 기록 이어쓰기" });
    if (role === "STUDENT") await expect(editLink).toHaveAttribute("href", "/student-questions?tab=mine&growth=growth-16");
    else await expect(editLink).toHaveCount(0);
    await page.getByRole("link", { name: "성장 기록 모아보기", exact: true }).click();
    await expect(page).toHaveURL(/#question-growth-library$/);
    await expectNoHorizontalPageOverflow(page);
    await testInfo.attach("growth-library", { body: await library.screenshot({ path: testInfo.outputPath("growth-library.png") }), contentType: "image/png" });
    expect(errors).toEqual([]);
  });
}
