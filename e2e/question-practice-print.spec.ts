import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { pdf as renderPdf } from "pdf-to-img";
import {
  cleanupQuestionLearningTeacher,
  prepareQuestionLearningTeacher,
  type QuestionLearningTeacherFixture,
} from "./helpers/test-db";

const PRINT_COPY = {
  ko: {
    printButton: "인쇄 또는 PDF 저장",
    title: "사실적·개념적·논쟁적 질문을 만드는 방법",
    guideTitle: "질문 유형 이해하기",
    worksheetTitle: "질문연습 활동",
  },
  en: {
    printButton: "Print or save PDF",
    title: "How to Make Factual, Conceptual, and Debatable Questions",
    guideTitle: "Understanding Question Types",
    worksheetTitle: "Question Practice Activities",
  },
} as const;

type PrintCall = {
  modeAtCall: boolean;
  modeAfterAfterPrint: boolean;
};

type PrintProbeWindow = Window & {
  __questionPracticePrintCalls?: PrintCall[];
};

async function loginAsTeacher(page: Page, teacher: QuestionLearningTeacherFixture) {
  await page.goto("/login");
  await page.getByRole("tab", { name: /교사/ }).click();
  await page.locator("#t-email").fill(teacher.email);
  await page.locator("#t-password").fill(teacher.password);
  await page.getByRole("button", { name: "교사 로그인" }).click();
  await page.waitForURL("**/teacher-dashboard", { timeout: 20_000 });
}

async function inspectRenderedPage(page: Page, image: Buffer) {
  return page.evaluate(async (imageUrl) => {
    const response = await fetch(imageUrl);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("PDF 쪽 그림을 검사할 수 없습니다.");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let offset = 0; offset < pixels.length; offset += 4) {
      const alpha = pixels[offset + 3];
      const hasInk =
        alpha >= 128 &&
        (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245);
      if (!hasInk) continue;

      const pixelIndex = offset / 4;
      const x = pixelIndex % canvas.width;
      const y = Math.floor(pixelIndex / canvas.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    if (maxX < 0 || maxY < 0) throw new Error("PDF 쪽 그림이 비어 있습니다.");

    return {
      width: canvas.width,
      height: canvas.height,
      leftMargin: minX,
      topMargin: minY,
      rightMargin: canvas.width - 1 - maxX,
      bottomMargin: canvas.height - 1 - maxY,
    };
  }, `data:image/png;base64,${image.toString("base64")}`);
}

test.describe("질문연습 학습지 출력", () => {
  let teacher: QuestionLearningTeacherFixture | undefined;
  let fixtureKey = "";

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "chromium") return;
    const runKey = process.env.GITHUB_RUN_ID ?? String(process.pid);
    fixtureKey = `practice-print-${runKey}-${testInfo.workerIndex}`;
    teacher = await prepareQuestionLearningTeacher(fixtureKey);
  });

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== "chromium") return;
    if (fixtureKey) await cleanupQuestionLearningTeacher(fixtureKey);
  });

  test("한국어와 영어 학습지가 빈 공간 없이 두 쪽으로 출력된다", async ({ context, page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "데스크톱 크로미엄 인쇄만 확인한다.");
    if (!teacher) throw new Error("교사 시험 자료가 준비되지 않았습니다.");
    await loginAsTeacher(page, teacher);
    await page.addInitScript(() => {
      const probe = window as PrintProbeWindow;
      probe.__questionPracticePrintCalls = [];
      window.print = () => {
        const call: PrintCall = {
          modeAtCall: document.body.classList.contains("question-practice-print-mode"),
          modeAfterAfterPrint: true,
        };
        probe.__questionPracticePrintCalls?.push(call);
        window.dispatchEvent(new Event("afterprint"));
        call.modeAfterAfterPrint = document.body.classList.contains("question-practice-print-mode");
      };
    });

    for (const locale of ["ko", "en"] as const) {
      await page.emulateMedia({ media: "screen" });
      await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: "http://localhost:3000" }]);
      await page.goto("/teacher-practice/print-guide");
      const copy = PRINT_COPY[locale];
      const printButton = page.getByRole("button", { name: copy.printButton, exact: true });

      await expect(printButton).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: copy.title, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: copy.guideTitle, exact: true })).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: copy.worksheetTitle, exact: true }),
      ).toBeVisible();

      await printButton.click();
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as PrintProbeWindow).__questionPracticePrintCalls ?? [],
          ),
        )
        .toEqual([{ modeAtCall: true, modeAfterAfterPrint: false }]);
      await expect(page.locator("body")).not.toHaveClass(/question-practice-print-mode/);

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
          const visibleDescendants = descendants.filter((descendant) => {
            const style = getComputedStyle(descendant);
            const rect = descendant.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          });
          const contentBounds = visibleDescendants.reduce(
            (bounds, descendant) => {
              const rect = descendant.getBoundingClientRect();
              return {
                left: Math.min(bounds.left, rect.left),
                top: Math.min(bounds.top, rect.top),
                right: Math.max(bounds.right, rect.right),
                bottom: Math.max(bounds.bottom, rect.bottom),
              };
            },
            { left: sheetRect.right, top: sheetRect.bottom, right: sheetRect.left, bottom: sheetRect.top },
          );
          return {
            height: sheetRect.height,
            horizontalScrollOverflow: Math.max(0, sheet.scrollWidth - sheet.clientWidth),
            verticalScrollOverflow: Math.max(0, sheet.scrollHeight - sheet.clientHeight),
            leftOverflow: Math.max(0, sheetRect.left - contentBounds.left),
            topOverflow: Math.max(0, sheetRect.top - contentBounds.top),
            rightOverflow: Math.max(0, contentBounds.right - sheetRect.right),
            bottomOverflow: Math.max(0, contentBounds.bottom - sheetRect.bottom),
            bottomGap: lastCardRect ? sheetRect.bottom - lastCardRect.bottom : Number.POSITIVE_INFINITY,
          };
        }),
      );

      for (const metric of metrics) {
        expect(metric.height).toBeGreaterThan(1060);
        expect(metric.height).toBeLessThan(1085);
        expect(metric.horizontalScrollOverflow).toBeLessThanOrEqual(1);
        expect(metric.verticalScrollOverflow).toBeLessThanOrEqual(1);
        expect(metric.leftOverflow).toBeLessThanOrEqual(1);
        expect(metric.topOverflow).toBeLessThanOrEqual(1);
        expect(metric.rightOverflow).toBeLessThanOrEqual(1);
        expect(metric.bottomOverflow).toBeLessThanOrEqual(1);
        expect(Math.abs(metric.bottomGap)).toBeLessThanOrEqual(2);
      }

      const pdfPath = testInfo.outputPath(`question-practice-${locale}.pdf`);
      const pdfBuffer = await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
      await testInfo.attach(`question-practice-${locale}.pdf`, { path: pdfPath, contentType: "application/pdf" });

      const renderedDocument = await renderPdf(pdfBuffer, { scale: 2 });
      try {
        expect(renderedDocument.length).toBe(2);

        for (let pageNumber = 1; pageNumber <= renderedDocument.length; pageNumber += 1) {
          const pageImage = await renderedDocument.getPage(pageNumber);
          const imagePath = testInfo.outputPath(`question-practice-${locale}-${pageNumber}.png`);
          await writeFile(imagePath, pageImage);
          await testInfo.attach(`question-practice-${locale}-${pageNumber}`, {
            path: imagePath,
            contentType: "image/png",
          });

          const rendered = await inspectRenderedPage(page, pageImage);
          expect(rendered.width).toBeGreaterThan(1180);
          expect(rendered.width).toBeLessThan(1200);
          expect(rendered.height).toBeGreaterThan(1675);
          expect(rendered.height).toBeLessThan(1690);
          expect(Math.abs(rendered.width / rendered.height - 210 / 297)).toBeLessThan(0.002);
          expect(rendered.leftMargin).toBeGreaterThan(20);
          expect(rendered.leftMargin).toBeLessThan(80);
          expect(rendered.topMargin).toBeGreaterThan(20);
          expect(rendered.topMargin).toBeLessThan(80);
          expect(rendered.rightMargin).toBeGreaterThan(20);
          expect(rendered.rightMargin).toBeLessThan(80);
          expect(rendered.bottomMargin).toBeGreaterThan(20);
          expect(rendered.bottomMargin).toBeLessThan(80);
        }
      } finally {
        await renderedDocument.destroy();
      }
    }
  });
});
