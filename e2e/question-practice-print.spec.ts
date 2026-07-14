import { expect, test, type Page } from "@playwright/test";
import {
  cleanupQuestionLearningTeacher,
  prepareQuestionLearningTeacher,
  type QuestionLearningTeacherFixture,
} from "./helpers/test-db";

const FIXTURE_KEY = "practice-print";

async function loginAsTeacher(page: Page, teacher: QuestionLearningTeacherFixture) {
  await page.goto("/login");
  await page.getByRole("tab", { name: /교사/ }).click();
  await page.locator("#t-email").fill(teacher.email);
  await page.locator("#t-password").fill(teacher.password);
  await page.getByRole("button", { name: "교사 로그인" }).click();
  await page.waitForURL("**/teacher-dashboard", { timeout: 20_000 });
}

function countPdfPages(pdf: Buffer): number {
  return Array.from(pdf.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)).length;
}

test.describe("질문연습 학습지 출력", () => {
  let teacher: QuestionLearningTeacherFixture | undefined;

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "chromium") return;
    teacher = await prepareQuestionLearningTeacher(FIXTURE_KEY);
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "chromium") return;
    await cleanupQuestionLearningTeacher(FIXTURE_KEY);
  });

  test("한국어와 영어 학습지가 빈 공간 없이 두 쪽으로 출력된다", async ({ context, page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "데스크톱 크로미엄 인쇄만 확인한다.");
    if (!teacher) throw new Error("교사 시험 자료가 준비되지 않았습니다.");
    await loginAsTeacher(page, teacher);

    for (const locale of ["ko", "en"] as const) {
      await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: "http://localhost:3000" }]);
      await page.goto("/teacher-practice/print-guide");
      await page.evaluate(() => document.body.classList.add("question-practice-print-mode"));
      await page.emulateMedia({ media: "print" });

      const sheets = page.locator(".qp-sheet");
      await expect(sheets).toHaveCount(2);
      await expect(page.locator(".qp-eyebrow")).toHaveCSS("display", "none");

      const metrics = await sheets.evaluateAll((elements) =>
        elements.map((element) => {
          const sheet = element as HTMLElement;
          const sheetRect = sheet.getBoundingClientRect();
          const cards = sheet.querySelectorAll<HTMLElement>(".qp-card-grid > .qp-card");
          const lastCard = cards.item(cards.length - 1);
          const lastCardRect = lastCard?.getBoundingClientRect();
          const descendants = Array.from(sheet.querySelectorAll<HTMLElement>("*"));
          const contentBottom = descendants.reduce(
            (bottom, descendant) => Math.max(bottom, descendant.getBoundingClientRect().bottom),
            sheetRect.top,
          );
          return {
            height: sheetRect.height,
            overflow: sheet.scrollHeight - sheet.clientHeight,
            visualOverflow: contentBottom - sheetRect.bottom,
            bottomGap: lastCardRect ? sheetRect.bottom - lastCardRect.bottom : Number.POSITIVE_INFINITY,
          };
        }),
      );

      for (const metric of metrics) {
        expect(metric.height).toBeGreaterThan(1060);
        expect(metric.height).toBeLessThan(1085);
        expect(metric.overflow).toBeLessThanOrEqual(1);
        expect(metric.visualOverflow).toBeLessThanOrEqual(1);
        expect(Math.abs(metric.bottomGap)).toBeLessThanOrEqual(2);
      }

      const pdfPath = testInfo.outputPath(`question-practice-${locale}.pdf`);
      const pdf = await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
      expect(countPdfPages(pdf)).toBe(2);
      await testInfo.attach(`question-practice-${locale}.pdf`, { path: pdfPath, contentType: "application/pdf" });

      for (let index = 0; index < 2; index += 1) {
        const imagePath = testInfo.outputPath(`question-practice-${locale}-${index + 1}.png`);
        await sheets.nth(index).screenshot({ path: imagePath });
        await testInfo.attach(`question-practice-${locale}-${index + 1}`, { path: imagePath, contentType: "image/png" });
      }
    }
  });
});
