import { expect, test } from "@playwright/test";
import { preparePage, sessions } from "./helpers/session-filter-page";
import { expectSingleLineNumber } from "./helpers/numeric-layout";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";

for (const role of ["TEACHER", "STUDENT"] as const) {
  for (const width of [375, 1024, 1440]) {
    test(`${role} ${width}px 질문 분류 통계의 개수와 비율을 한 줄로 표시한다`, async ({ page, baseURL }) => {
      const { errors } = await preparePage(page, role, baseURL!);
      await page.setViewportSize({ width, height: 1000 });
      const items = Array.from({ length: 12 }, (_, i) => ({
        id: `numeric-question-${i}`, content: `물의 증발에 관한 관찰 질문 ${i + 1}입니다.`,
        closure: "open", cognitive: "conceptual", session: sessions[0], sessionId: sessions[0].id,
        author: { id: "filter-test-STUDENT", name: "통계 학생" }, isPublic: true,
        createdAt: "2026-09-06T00:00:00Z", likeCount: 0, commentCount: 0,
      }));
      await page.route("**/api/questions?**", route => route.fulfill({ json: role === "TEACHER" ? {
        items, pageInfo: { page: 1, pageSize: 30, total: 12, totalPages: 1 },
        summary: { total: 12, closure: { closed: 0, open: 12 }, cognitive: { factual: 0, conceptual: 12, controversial: 0 }, flagged: 0 },
      } : items }));
      await page.goto(role === "TEACHER" ? "/teacher-questions" : "/student-questions?tab=mine");
      const numbers = page.getByText("12 (100%)", { exact: true }).filter({ visible: true });
      await expect(numbers).toHaveCount(2);
      for (const value of await numbers.all()) await expectSingleLineNumber(value);
      await expectNoHorizontalPageOverflow(page);
      expect(errors).toEqual([]);
    });

    test(`${role} ${width}px 순위표의 여러 자리 포인트와 순위를 한 줄로 표시한다`, async ({ page, baseURL }) => {
      const { errors } = await preparePage(page, role, baseURL!);
      await page.setViewportSize({ width, height: 1000 });
      await page.route("**/api/teacher/students**", route => route.fulfill({ json: { students: [], teacherClasses: [], activity: [] } }));
      await page.route("**/api/points/class-ranks?**", route => route.fulfill({ json: {
        klass: { school: "시험 학교", grade: "5", className: "12" }, total: 12,
        students: Array.from({ length: 12 }, (_, i) => ({
          id: `rank-${i}`, name: `질문하는 학생 ${i + 1}`, studentNumber: String(i + 10),
          totalPoints: 12345, classRank: i + 1, schoolRank: 123, allRank: 1234, isMe: i === 11,
        })),
      } }));
      const myClass = { school: "시험 학교", grade: "5", className: "12", rank: 123, memberCount: 12, avgPoints: 12345 };
      await page.route("**/api/points/class-leaderboard?**", route => route.fulfill({ json: {
        scope: "school", classes: [myClass], myClass, total: 123,
      } }));
      await page.goto(role === "TEACHER" ? "/teacher-points" : "/student-points");
      await expect(page.getByText("질문하는 학생 12", { exact: true })).toBeVisible();
      const numbers = page.locator("td").filter({ hasText: /^\d{2,}(?:명)?$/ }).filter({ visible: true });
      const controls = await numbers.all();
      expect(controls.length).toBeGreaterThan(12);
      for (const control of controls) await expectSingleLineNumber(control);
      await expectNoHorizontalPageOverflow(page);
      expect(errors).toEqual([]);
    });
  }
}
