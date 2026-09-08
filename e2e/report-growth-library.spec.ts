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
records.push({ ...records[0], questionId: "auto-only", revisedContent: "자동으로 저장된 질문만 있는 기록", changeNote: "", reflection: "" });

for (const role of ["STUDENT", "TEACHER"] as const) {
  test(`${role === "STUDENT" ? "학생" : "교사"} 리포트는 수업별로 직접 작성한 성장 기록만 보여 주고 전체 검색을 표시하지 않는다`, async ({ page, baseURL }, testInfo) => {
    const { errors } = await preparePage(page, role, baseURL!);
    await page.setViewportSize({ width: role === "STUDENT" ? 375 : 1440, height: 900 });
    const growthRequests: URLSearchParams[] = [];
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
      growthRequests.push(url.searchParams);
      const scoped = records.filter(record => (!sessionId || record.question.session.id === sessionId) && (url.searchParams.get("view") !== "session" || record.changeNote.trim() || record.reflection.trim()));
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
    await expect(analysis.getByRole("button", { name: /용해와 용액/ })).toBeVisible();
    await expect(page.locator("#question-growth-library")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "성장 기록 모아보기", exact: true })).toHaveCount(0);
    expect(growthRequests).toEqual([]);
    await analysis.getByRole("button", { name: /용해와 용액/ }).click();
    const lessonGrowth = analysis.getByRole("button", { name: /용해와 용액/ }).locator("..").locator("..").getByRole("region", { name: "이 수업의 질문 성장 기록" });
    await expect(lessonGrowth.locator("article")).toHaveCount(8);
    await expect(lessonGrowth.getByText("비교할 조건을 넣었어요.", { exact: true }).first()).toBeVisible();
    await expect(lessonGrowth).not.toContainText("약수와 배수");
    await expect(lessonGrowth).not.toContainText("자동으로 저장된 질문만 있는 기록");
    await expect(lessonGrowth.getByRole("searchbox")).toHaveCount(0);
    await expect(lessonGrowth.getByRole("group", { name: "성장 기록 작성 상태" })).toHaveCount(0);
    await expect(lessonGrowth).not.toContainText("탐구 후 배운 점을 이어 쓸 수 있어요.");
    await lessonGrowth.getByRole("button", { name: "다음 기록" }).click();
    await expect(lessonGrowth.locator("article")).toHaveCount(1);
    await expect(lessonGrowth).toContainText("다듬은 나의 질문 17");
    await analysis.getByRole("button", { name: /약수와 배수/ }).click();
    const mathGrowth = analysis.getByRole("button", { name: /약수와 배수/ }).locator("..").locator("..").getByRole("region", { name: "이 수업의 질문 성장 기록" });
    await expect(mathGrowth.locator("article")).toHaveCount(8);
    await expect(mathGrowth.getByText("조건을 같게 해야 비교할 수 있어요.", { exact: true }).first()).toBeVisible();
    expect(growthRequests.every(params => params.get("view") === "session" && ["growth-science", "growth-math"].includes(params.get("sessionId")!))).toBe(true);
    const editLink = lessonGrowth.getByRole("link", { name: "성장 기록 이어쓰기" });
    if (role === "STUDENT") await expect(editLink).toHaveAttribute("href", "/student-questions?tab=mine&growth=growth-16");
    else await expect(editLink).toHaveCount(0);
    await expectNoHorizontalPageOverflow(page);
    await testInfo.attach("session-growth", { body: await lessonGrowth.screenshot({ path: testInfo.outputPath("session-growth.png") }), contentType: "image/png" });
    expect(errors).toEqual([]);
  });
}
