import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parsePracticeSelection,
  practiceSelectionSearch,
  type PracticeSelection,
} from "@/lib/practice-selection";

const params = (value: string) => new URLSearchParams(value);

describe("연습 추천 주소 선택", () => {
  it("누락되거나 허용되지 않은 탭과 축은 분류와 사고 유형 축으로 되돌린다", () => {
    expect(parsePracticeSelection(params(""))).toEqual({
      tab: "quiz",
      quizMode: "cognitive",
      focus: null,
    });
    expect(parsePracticeSelection(params("tab=stats&quizMode=unknown&focus=closed"))).toEqual({
      tab: "quiz",
      quizMode: "cognitive",
      focus: null,
    });
  });

  it("닫힌 열린 축에는 닫힌 질문과 열린 질문만 유지한다", () => {
    expect(parsePracticeSelection(params("tab=quiz&quizMode=closure&focus=open"))).toEqual({
      tab: "quiz",
      quizMode: "closure",
      focus: "open",
    });
    expect(parsePracticeSelection(params("tab=quiz&quizMode=closure&focus=conceptual")).focus).toBeNull();
  });

  it("사고 유형 축에는 사실적 개념적 논쟁적 유형만 유지한다", () => {
    expect(parsePracticeSelection(params("tab=quiz&quizMode=cognitive&focus=controversial"))).toEqual({
      tab: "quiz",
      quizMode: "cognitive",
      focus: "controversial",
    });
    expect(parsePracticeSelection(params("tab=quiz&quizMode=cognitive&focus=closed")).focus).toBeNull();
  });

  it("바꾸기와 만들기 탭에서는 유형 집중값을 버린다", () => {
    expect(parsePracticeSelection(params("tab=transform&quizMode=closure&focus=open"))).toEqual({
      tab: "transform",
      quizMode: "closure",
      focus: null,
    });
    expect(parsePracticeSelection(params("tab=create&quizMode=cognitive&focus=factual"))).toEqual({
      tab: "create",
      quizMode: "cognitive",
      focus: null,
    });
  });

  it.each<PracticeSelection>([
    { tab: "quiz", quizMode: "closure", focus: "closed" },
    { tab: "quiz", quizMode: "cognitive", focus: "conceptual" },
    { tab: "transform", quizMode: "cognitive", focus: null },
    { tab: "create", quizMode: "closure", focus: null },
  ])("직렬화한 허용 선택을 다시 읽으면 같은 선택이다", (selection) => {
    expect(parsePracticeSelection(params(practiceSelectionSearch(selection)))).toEqual(selection);
  });

  it("학생과 교사 페이지가 같은 선택 파서를 거쳐 공통 연습 화면에 넘긴다", () => {
    for (const path of [
      "src/app/(student)/student-practice/page.tsx",
      "src/app/(teacher)/teacher-practice/page.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("parsePracticeSelection(searchParams)");
      expect(source).toContain("initialSelection={initialSelection}");
    }
  });
});
