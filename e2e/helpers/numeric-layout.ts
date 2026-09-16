import { expect, type Locator } from "@playwright/test";

// 실제 글자 위치를 검사한다. 스타일 이름이 같아도 열 폭이나 여백 때문에 깨지면 실패한다.
export async function expectSingleLineNumber(control: Locator) {
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
    const box = element.getBoundingClientRect();
    const tops = rects.map(rect => rect.top);
    return {
      text: element.textContent?.trim(),
      lineSpread: Math.max(...tops) - Math.min(...tops),
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      clipped: element.scrollWidth > element.clientWidth + 1,
      escaped: rects.some(rect => rect.left < box.left - 1 || rect.right > box.right + 1),
    };
  });
  expect(layout.lineSpread, JSON.stringify(layout)).toBeLessThan(layout.lineHeight / 2);
  expect(layout.clipped, JSON.stringify(layout)).toBe(false);
  expect(layout.escaped, JSON.stringify(layout)).toBe(false);
}
