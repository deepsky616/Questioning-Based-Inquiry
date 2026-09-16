import { expect, test } from "@playwright/test";
import readExcelFile from "read-excel-file/node";
import { preparePage } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";
import { createQuestionWorkbook } from "../src/lib/question-export-workbook";

for (const width of [375, 1440]) {
  test(`${width}px 질문 목록에서 필터 전체와 선택한 질문을 실제 엑셀 파일로 내려받는다`, async ({ page, baseURL }, testInfo) => {
    const { errors } = await preparePage(page, "TEACHER", baseURL!);
    await page.setViewportSize({ width, height: 1000 });
    const rows = Array.from({ length: 61 }, (_, index) => ({
      id: `export-${index}`, content: `증발 관찰 질문 ${index + 1}`, closure: "open", cognitive: "conceptual",
      session: { id: "filter-weather", date: "2026-09-06", subject: "과학", topic: "날씨", targetGrade: "5" },
      author: { id: "student", name: "김질문", grade: "5", className: "1", studentNumber: "2" },
      createdAt: new Date("2026-09-06T00:00:00Z"), isPublic: true, flagged: false, flagReason: null,
      _count: { likes: 12, comments: 123 }, comments: [],
    }));
    await page.route("**/api/questions?**", route => route.fulfill({ json: {
      items: rows.slice(0, 30).map(row => ({ ...row, sessionId: row.session.id, likeCount: 12, commentCount: 123 })),
      pageInfo: { page: 1, pageSize: 30, total: 61, totalPages: 3 },
      summary: { total: 61, closure: { closed: 0, open: 61 }, cognitive: { factual: 0, conceptual: 61, controversial: 0 }, flagged: 0 },
    } }));
    const requests: string[] = [];
    await page.route("**/api/questions/export?**", async route => {
      const request = route.request();
      const params = new URL(request.url()).searchParams;
      expect(request.method()).toBe("POST");
      expect(Object.fromEntries(params)).toEqual({ subject: "과학", closure: "open", search: "물", likeSort: "desc" });
      const body = request.postDataJSON();
      requests.push(body.scope);
      const selected = body.scope === "selected" ? rows.filter(row => body.questionIds.includes(row.id)) : rows;
      const { buffer, filename } = await createQuestionWorkbook(selected, { ...body, searchParams: params });
      await route.fulfill({ body: buffer, headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "X-Question-Count": String(selected.length),
      } });
    });
    await page.goto("/teacher-questions?subject=과학&closure=open&search=물&sort=like&dir=desc");
    await page.getByRole("button", { name: "엑셀 다운로드", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { name: "검색·필터 결과 전체 61개", exact: true })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "선택한 질문 0개", exact: true })).toBeDisabled();
    await expectNoHorizontalPageOverflow(page);
    await testInfo.attach(`엑셀-다운로드-${width}`, { body: await page.screenshot({ path: testInfo.outputPath("excel-dialog.png"), animations: "disabled" }), contentType: "image/png" });
    const allDownload = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "다운로드", exact: true }).click();
    const all = await allDownload;
    expect(all.suggestedFilename()).toMatch(/^학생_질문_.*\.xlsx$/);
    const allPath = testInfo.outputPath("all-questions.xlsx");
    await all.saveAs(allPath);
    const allRows = (await readExcelFile(allPath)).find(sheet => sheet.sheet === "질문 목록")!.data;
    expect(allRows).toHaveLength(62);
    expect(allRows[61][8]).toBe("증발 관찰 질문 61");
    expect(allRows[1][7]).toBe("김질문");
    await expect(dialog).toHaveCount(0);

    await page.getByRole("checkbox", { name: "김질문: 증발 관찰 질문 4", exact: true }).filter({ visible: true }).check();
    await page.getByRole("button", { name: "엑셀 다운로드", exact: true }).click();
    await expect(dialog.getByRole("radio", { name: "선택한 질문 1개", exact: true })).toBeChecked();
    const selectedDownload = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "다운로드", exact: true }).click();
    const selectedPath = testInfo.outputPath("selected-question.xlsx");
    await (await selectedDownload).saveAs(selectedPath);
    const selectedRows = (await readExcelFile(selectedPath)).find(sheet => sheet.sheet === "질문 목록")!.data;
    expect(selectedRows).toHaveLength(2);
    expect(selectedRows[1][8]).toBe("증발 관찰 질문 4");
    expect(requests).toEqual(["filtered", "selected"]);
    expect(errors).toEqual([]);
  });
}
