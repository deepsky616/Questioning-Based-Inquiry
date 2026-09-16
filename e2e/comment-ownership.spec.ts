import { expect, test } from "@playwright/test";
import { preparePage, sessions } from "./helpers/session-filter-page";
import { expectNoHorizontalPageOverflow } from "./helpers/question-game-room";

for (const role of ["TEACHER", "STUDENT"] as const) {
  for (const width of [375, 1440]) {
    test(`${role} ${width}px에서 본인 댓글과 동명이인의 댓글을 구분하고 새 댓글에도 적용한다`, async ({ page, baseURL }, testInfo) => {
      const { errors } = await preparePage(page, role, baseURL!);
      await page.setViewportSize({ width, height: 1100 });
      await page.addInitScript(theme => localStorage.setItem("question-lab-theme", theme), width === 375 ? "dark" : "light");
      const me = { id: `filter-test-${role}`, name: "필터 시험" };
      const other = { id: "another-account", name: me.name };
      const comments = [
        { id: "own", author: me, content: "나는 물의 양을 같게 하고 비교했어요." },
        { id: "other", author: other, content: "나는 바람의 세기도 살펴보고 싶어요." },
        { id: "own-flagged", author: me, content: "확인이 필요한 내 댓글입니다.", flagged: true },
        { id: "other-flagged", author: other, content: "확인이 필요한 다른 댓글입니다.", flagged: true },
      ].map(comment => ({ ...comment, createdAt: "2026-09-06T01:00:00Z" }));
      const question = {
        id: "ownership-question", content: "바람이 불면 물은 더 빨리 증발할까요?", closure: "open", cognitive: "conceptual",
        sessionId: sessions[0].id, session: sessions[0], author: other,
        createdAt: "2026-09-06T00:00:00Z", isPublic: true, likeCount: 0, commentCount: comments.length, comments,
      };
      await page.route("**/api/questions?**", route => route.fulfill({ json: role === "TEACHER" ? {
        items: [question], pageInfo: { page: 1, pageSize: 30, total: 1, totalPages: 1 },
        summary: { total: 1, closure: { closed: 0, open: 1 }, cognitive: { factual: 0, conceptual: 1, controversial: 0 }, flagged: 1 },
      } : [question] }));
      const posted: string[] = [];
      await page.route("**/api/questions/ownership-question/comments", route => {
        if (route.request().method() === "GET") return route.fulfill({ json: comments });
        expect(route.request().method()).toBe("POST");
        const content = route.request().postDataJSON().content;
        posted.push(content);
        return route.fulfill({ json: { id: "new-comment", content, author: me, createdAt: "2026-09-06T02:00:00Z" } });
      });
      await page.goto(role === "TEACHER" ? "/teacher-questions" : "/student-questions?tab=explore");
      await page.getByRole("button").filter({ hasText: /💬\s*4/ }).filter({ visible: true }).click();
      const cards = page.getByRole("article").filter({ visible: true });
      const card = (content: string) => cards.filter({ hasText: content });
      const own = card(comments[0].content);
      const peer = card(comments[1].content);
      await expect(own.getByText("내 댓글", { exact: true })).toBeVisible();
      await expect(peer.getByText("내 댓글", { exact: true })).toHaveCount(0);
      await expect(own.getByRole("button", { name: "✏️ 수정", exact: true })).toBeVisible();
      await expect(peer.getByRole("button", { name: "✏️ 수정", exact: true })).toHaveCount(0);
      const background = (content: string) => card(content).evaluate(element => getComputedStyle(element).backgroundColor);
      const ownBackground = await background(comments[0].content);
      expect(ownBackground).not.toBe(await background(comments[1].content));
      // 경고가 본인 배경보다 우선하고, 본인 표시는 함께 유지된다.
      await expect(card(comments[2].content).getByText("내 댓글", { exact: true })).toBeVisible();
      await expect(card(comments[2].content).getByText(/부적절 의심/)).toBeVisible();
      expect(await background(comments[2].content)).toBe(await background(comments[3].content));
      expect(await background(comments[2].content)).not.toBe(ownBackground);
      // 댓글 순서를 바꾸지 않는다.
      const bodies = await cards.locator("p").allTextContents();
      expect(bodies).toEqual(comments.map(comment => comment.content));
      const newContent = "같은 시간 동안 줄어든 물의 양을 기록해 볼게요.";
      await page.getByPlaceholder("댓글을 입력하세요...").filter({ visible: true }).fill(newContent);
      await page.getByRole("button", { name: "등록", exact: true }).filter({ visible: true }).click();
      await expect(card(newContent).getByText("내 댓글", { exact: true })).toBeVisible();
      expect(await background(newContent)).toBe(ownBackground);
      expect(posted).toEqual([newContent]);
      await own.scrollIntoViewIfNeeded();
      await expectNoHorizontalPageOverflow(page);
      await testInfo.attach(`댓글-구분-${role}-${width}`, { body: await page.screenshot({ path: testInfo.outputPath("comments.png"), animations: "disabled" }), contentType: "image/png" });
      expect(errors).toEqual([]);
    });
  }
}
