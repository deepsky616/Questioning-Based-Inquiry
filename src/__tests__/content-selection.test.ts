import { describe, expect, it } from "vitest";
import {
  selectAllContentItems,
  splitCoreIdeaLines,
  toggleContentItem,
} from "@/lib/content-selection";

describe("content-selection", () => {
  it("핵심아이디어를 빈 줄 없이 선택 가능한 줄로 분리한다", () => {
    expect(splitCoreIdeaLines("첫 번째 핵심아이디어\n\n 두 번째 핵심아이디어 ")).toEqual([
      "첫 번째 핵심아이디어",
      "두 번째 핵심아이디어",
    ]);
  });

  it("전체 선택은 표시 범위 안의 내용요소만 선택한다", () => {
    expect(selectAllContentItems(["지식1", "지식2", "지식3"], 2)).toEqual([
      "지식1",
      "지식2",
    ]);
  });

  it("전체 선택에서 빈 내용요소는 제외한다", () => {
    expect(selectAllContentItems(["과정1", " ", "과정2"])).toEqual([
      "과정1",
      "과정2",
    ]);
  });

  it("내용요소를 토글해서 선택과 해제를 처리한다", () => {
    expect(toggleContentItem(["관찰"], "분류")).toEqual(["관찰", "분류"]);
    expect(toggleContentItem(["관찰", "분류"], "관찰")).toEqual(["분류"]);
  });
});
