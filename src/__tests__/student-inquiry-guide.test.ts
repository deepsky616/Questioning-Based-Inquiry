import { describe, expect, it } from "vitest";
import {
  mergeGeneratedStudentGuides,
  normalizeStudentInquiryGuide,
  parseInquiryKeywordLines,
} from "@/lib/student-inquiry-guide";

describe("학생용 탐구질문 안내", () => {
  it("생성된 안내를 질문 순서에 맞춰 합치고 원문은 바꾸지 않는다", () => {
    const questions = [
      { type: "factual" as const, content: "식물은 어디에서 양분을 만들까?" },
      { type: "conceptual" as const, content: "빛과 식물의 성장은 어떤 관계일까?" },
    ];

    const merged = mergeGeneratedStudentGuides(questions, [
      {
        index: 0,
        meaning: "식물이 양분을 만드는 장소를 찾아보는 질문이에요.",
        keywords: [{ term: "양분", meaning: "식물이 자라는 데 필요한 물질" }],
        thinkingStart: "식물의 잎과 줄기를 관찰해 보세요.",
      },
    ]);

    expect(merged[0]).toEqual({
      ...questions[0],
      studentGuide: {
        meaning: "식물이 양분을 만드는 장소를 찾아보는 질문이에요.",
        keywords: [{ term: "양분", meaning: "식물이 자라는 데 필요한 물질" }],
        thinkingStart: "식물의 잎과 줄기를 관찰해 보세요.",
      },
    });
    expect(merged[1]).toEqual(questions[1]);
  });

  it("비어 있거나 너무 많은 낱말을 정리하고 편집 줄을 구조화한다", () => {
    expect(normalizeStudentInquiryGuide({
      meaning: "  쉬운 풀이  ",
      keywords: [
        { term: " 빛 ", meaning: " 에너지의 한 형태 " },
        { term: "", meaning: "제외" },
      ],
      thinkingStart: "  먼저 관찰해 보세요. ",
    })).toEqual({
      meaning: "쉬운 풀이",
      keywords: [{ term: "빛", meaning: "에너지의 한 형태" }],
      thinkingStart: "먼저 관찰해 보세요.",
    });
    expect(parseInquiryKeywordLines("빛: 에너지의 한 형태\n잎 - 식물의 기관\n빈줄")).toEqual([
      { term: "빛", meaning: "에너지의 한 형태" },
      { term: "잎", meaning: "식물의 기관" },
      { term: "빈줄", meaning: "" },
    ]);
  });
});
