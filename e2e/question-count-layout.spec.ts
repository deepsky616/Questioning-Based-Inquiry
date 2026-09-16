import { expect, test, type Locator } from "@playwright/test";
import { preparePage, sessions } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";

// 실제 글자 위치를 검사해 숫자·아이콘이 다음 줄로 나뉘거나 잘리는 회귀를 잡는다.
async function expectSingleLineCount(control: Locator) {
  await expect(control).toBeVisible();
  const layout = await control.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const rects: DOMRect[] = [];
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      rects.push(...Array.from(range.getClientRects()).filter(rect => rect.width > 0));
    }
    const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
    const tops = rects.map(rect => rect.top);
    return {
      lineSpread: Math.max(...tops) - Math.min(...tops),
      lineHeight,
      clipped: element.scrollWidth > element.clientWidth + 1,
    };
  });
  expect(layout.lineSpread).toBeLessThan(layout.lineHeight / 2);
  expect(layout.clipped).toBe(false);
}

for (const view of ["teacher", "mine", "explore", "design"] as const) {
  const role = view === "teacher" ? "TEACHER" : "STUDENT";
  for (const width of [375, 1024, 1440]) {
    test(`${view} ${width}px에서 여러 자리의 좋아요·댓글 수를 한 줄로 표시한다`, async ({ page, baseURL }, testInfo) => {
      const { errors } = await preparePage(page, role, baseURL!);
      await page.setViewportSize({ width, height: 1000 });
      const items = [12, 123, 1234].map((count, i) => ({
        id: `count-${count}`, content: `숫자 표시 ${count} 검증: 물의 온도에 따라 증발하는 빠르기는 어떻게 달라질까요?`,
        closure: "open", cognitive: "conceptual", closureScore: 0.2, cognitiveScore: 0.8,
        sessionId: sessions[i].id, session: sessions[i], author: { id: "other-student", name: "시험 학생" },
        isPublic: true, createdAt: `${sessions[i].date}T00:00:00Z`,
        likeCount: count, commentCount: count, myLike: false, likedBy: [],
        comments: Array.from({ length: count }, (_, n) => ({ id: `comment-${i}-${n}`, content: "관찰한 내용을 비교해 보아요." })),
      }));
      await page.route("**/api/questions?**", route => route.fulfill({ json: role === "TEACHER" ? {
        items, pageInfo: { page: 1, pageSize: 30, total: items.length, totalPages: 1 },
        summary: { total: 3, closure: { closed: 0, open: 3 }, cognitive: { factual: 0, conceptual: 3, controversial: 0 }, flagged: 0 },
      } : items }));
      if (view === "design") {
        await page.route("**/api/sessions", route => route.fulfill({ json: [{
          ...sessions[0], sharedQuestions: items.map((item, i) => ({ type: "conceptual", content: item.content, source: "student", priority: i + 1, contentGroup: "증발 관찰", mergedFrom: [item.content] })),
        }] }));
        await page.route("**/api/sessions/*/publish-questions", route => route.fulfill({ json: {
          published: items, likesVisible: true, commentsVisible: true,
        } }));
      }
      await page.goto(role === "TEACHER" ? "/teacher-questions" : `/student-questions?tab=${view}`);
      await expect(page.getByText(items[0].content, { exact: true }).filter({ visible: true })).toBeVisible();
      for (const count of [12, 123, 1234]) {
        const visibleCounters = page.locator("button, p, span")
          .filter({ hasText: new RegExp(`^(?:[❤️🤍💬\\s]*)${count}(?:\\s*(?:댓글|닫기))?$`, "u") })
          .filter({ visible: true });
        const controls = await visibleCounters.all();
        expect(controls.length).toBeGreaterThanOrEqual(2);
        for (const control of controls) await expectSingleLineCount(control);
      }
      await expectNoHorizontalPageOverflow(page);
      expect(errors).toEqual([]);
      await testInfo.attach(`숫자-표시-${view}-${width}`, { body: await page.screenshot({ path: testInfo.outputPath("counts.png"), fullPage: true }), contentType: "image/png" });
    });
  }
}
