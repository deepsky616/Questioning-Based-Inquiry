import { expect, test } from "@playwright/test";
import { preparePage } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";
import ko from "../messages/ko.json";
import en from "../messages/en.json";

const types = {
  closed: { attempts: 3, correct: 3, accuracy: 100 }, open: { attempts: 5, correct: 2, accuracy: 40 },
  factual: { attempts: 3, correct: 3, accuracy: 100 }, conceptual: { attempts: 3, correct: 3, accuracy: 100 }, controversial: { attempts: 3, correct: 3, accuracy: 100 },
};
const diagnostic = { activityAttempts: 19, diagnosticAttempts: 17, overall: { attempts: 17, correct: 14, accuracy: 82 }, modes: { quiz: { attempts: 17, correct: 14, accuracy: 82 }, transform: { attempts: 0, correct: 0, accuracy: null }, create: { attempts: 0, correct: 0, accuracy: null } }, types, unknownTypeAttempts: 0, recommendation: { kind: "focus", tab: "quiz", quizMode: "closure", focus: "open" } };
const students = [
  { ...diagnostic, id: "s1", name: "김질문", types: { ...types, closed: { attempts: 2, correct: 1, accuracy: 50 } }, recommendation: { kind: "focus", tab: "quiz", quizMode: "closure", focus: "closed" } },
  { ...diagnostic, id: "s2", name: "학생2" },
  { ...diagnostic, id: "s3", name: "학생3", types: { ...types, open: { attempts: 5, correct: 5, accuracy: 100 } }, recommendation: { kind: "advance", tab: "transform", quizMode: null, focus: null } },
].map((student, index) => ({ ...student, grade: "5", className: "1", studentNumber: String(index + 1), todayPoints: 2, weekPoints: 7, quizCount: 3, transformCount: 0, createCount: 0, capped: false }));

for (const width of [375, 768, 1440]) {
  test(`교사 ${width} 화면에서 기록 부족·보충·다음 단계 추천과 기준을 구분한다`, async ({ page, baseURL }, testInfo) => {
    const { errors } = await preparePage(page, "TEACHER", baseURL!);
    await page.setViewportSize({ width, height: 1024 });
    const english = width === 768;
    const messages = english ? en : ko;
    if (english) await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
    await page.addInitScript(theme => localStorage.setItem("question-lab-theme", theme), width === 375 ? "dark" : "light");
    await page.route("**/api/teacher/practice-stats", route => route.fulfill({ json: { summary: diagnostic, students } }));
    await page.goto("/teacher-practice?view=stats");
    const table = page.getByRole("table");
    await expect(table.getByText(english ? "Closed: 2 of 3 attempts · 1 more needed" : "닫힌 질문 2회 / 기준 3회 · 1회 추가 필요", { exact: true })).toBeVisible();
    await expect(table.getByText(english ? "More practice records needed" : "풀이 기록 추가 필요", { exact: true })).toBeVisible();
    await expect(table.getByText(english ? "Extra practice: Open" : "열린 질문 보충 연습 추천", { exact: true })).toBeVisible();
    await expect(table.getByText(english ? "Try question transformation" : "질문 바꾸기 연습 추천", { exact: true })).toBeVisible();
    await page.getByText(english ? "How recommendations work" : "추천 기준 보기", { exact: true }).click();
    await expect(page.getByText(english ? /Repeated attempts at the same question/ : /같은 날 같은 문제를 같은 방식으로 반복하면/)).toBeVisible();
    await expectNoHorizontalPageOverflow(page);
    // 페이지 밖으로 넘치지 않더라도 표 안에서 긴 추천 내용이 잘리면 안 된다.
    expect(await table.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    if (width < 1024) {
      const studentRow = table.getByRole("row").filter({ has: page.getByRole("button", { name: /김질문/ }) });
      const recommendation = studentRow.getByRole("cell").last();
      const rowBox = await studentRow.boundingBox();
      const recommendationBox = await recommendation.boundingBox();
      expect(recommendationBox!.width).toBeGreaterThan(rowBox!.width * 0.75);
    }
    await testInfo.attach("practice-wording", { body: await page.screenshot({ path: testInfo.outputPath("practice-wording.png"), fullPage: true }), contentType: "image/png" });
    await page.getByRole("group", { name: messages.practice.statsFocusFilter }).getByRole("button", { name: messages.classification.open.label, exact: true }).click();
    await expect(page.getByRole("link", { name: messages.practice.statsPreviewBuiltIn, exact: true })).toHaveAttribute("href", "/teacher-practice?view=try&tab=quiz&quizMode=closure&focus=open");
    await expect(page.getByRole("button", { name: messages.practice.statsCopyStudentLink, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: messages.practice.statsManageBank, exact: true })).toHaveAttribute("href", "/teacher-practice?view=bank");
    expect(errors).toEqual([]);
  });
}
