import { expect, test } from "@playwright/test";
import { preparePage } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";
import { expectSingleLineNumber } from "./helpers/numeric-layout";

const totals = [12, 123, 1234, 12345];
const students = totals.map((total, i) => ({
  studentId: `stats-${i}`, name: `통계 학생 ${i + 1}`, grade: "5", className: "12", studentNumber: String(i + 12),
  total, distribution: { closed: total, open: 0 },
  cognitiveDistribution: { factual: total, conceptual: 0, controversial: 0 },
  trend: i === 0 ? null : (i - 2) * 100, sparkline: [0, 3, 12, 10, 5],
}));
const stats = {
  total: 13714, byClosure: { closed: 13714, open: 0 },
  byCognitive: { factual: 12, conceptual: 123, controversial: 13579 },
  byStudent: students, timeline: [], school: "시험 학교", teacherClasses: [{ grade: "5", className: "12" }],
};

for (const role of ["TEACHER", "STUDENT"] as const) {
  for (const width of [375, 768, 1024, 1440]) {
    test(`${role} ${width}px 통계의 여러 자리 숫자와 비율이 한 줄로 표시된다`, async ({ page, baseURL }, testInfo) => {
      const { errors } = await preparePage(page, role, baseURL!);
      await page.setViewportSize({ width, height: 1100 });
      await page.route("**/api/stats?**", route => route.fulfill({ json: stats }));
      await page.route("**/api/teacher/students?**", route => route.fulfill({ json: {
        students: [], teacherClasses: stats.teacherClasses, activity: [],
      } }));
      await page.route("**/api/teacher/flagged-count", route => route.fulfill({ json: { total: 123, questions: 100, comments: 23 } }));
      await page.route("**/api/questions?view=dashboard", route => route.fulfill({ json: { stats, recent: [], answeredSessionIds: [] } }));
      await page.route("**/api/points/me", route => route.fulfill({ json: { totalPoints: 12345, recent: [] } }));
      await page.route("**/api/points/leaderboard?**", route => route.fulfill({ json: {
        scope: new URL(route.request().url()).searchParams.get("scope"), me: { rank: 1234, totalPoints: 12345 },
      } }));
      await page.goto(role === "TEACHER" ? "/teacher-dashboard" : "/student-dashboard");
      await expect(page.getByText("13714", { exact: true }).first()).toBeVisible();
      if (role === "TEACHER") {
        await page.getByText("학생별 통계", { exact: true }).scrollIntoViewIfNeeded();
        await testInfo.attach(`학생별-통계-${width}`, { body: await page.screenshot({ path: testInfo.outputPath("student-statistics.png"), animations: "disabled" }), contentType: "image/png" });
        for (const student of students) {
          if (width >= 1024) {
            const row = page.getByRole("row").filter({ hasText: student.name });
            for (const cell of await row.getByRole("cell").all()) {
              if (/^\d+$/.test((await cell.innerText()).trim())) await expectSingleLineNumber(cell);
            }
          } else {
            for (const value of await page.getByText(String(student.total), { exact: true }).filter({ visible: true }).all()) {
              await expectSingleLineNumber(value);
            }
          }
        }
      } else {
        await expect(page.getByText("12345", { exact: true })).toBeVisible();
      }
      // 총계·분류별 개수·백분율·포인트·순위를 실제 렌더된 숫자로 검사한다.
      const numbers = page.locator(".learning-content p, .learning-content span, .learning-content b, .learning-content td")
        .filter({ hasText: /^[+-]?\d{2,}(?:%|위|점)?$/ }).filter({ visible: true });
      const controls = await numbers.all();
      expect(controls.length).toBeGreaterThan(8);
      for (const control of controls) await expectSingleLineNumber(control);
      await expectNoHorizontalPageOverflow(page);
      expect(errors).toEqual([]);
    });
  }
}
