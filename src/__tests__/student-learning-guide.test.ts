import { describe, expect, it } from "vitest";
import {
  normalizeStudentLearningGuides,
  remapStudentLearningGuides,
  removeIndexedStudentLearningGuide,
} from "@/lib/student-learning-guide";

describe("학생용 단원 이해 자료", () => {
  it("핵심 아이디어와 문장, 핵심 질문 설명을 정리한다", () => {
    expect(normalizeStudentLearningGuides({
      coreIdea: {
        explanation: "  식물이 빛을 이용하는 큰 원리를 알아봐요. ",
        lifeConnection: "  화분이 햇빛 쪽으로 자라는 모습을 떠올려 보세요. ",
        keywords: [{ term: " 광합성 ", meaning: " 빛으로 양분을 만드는 과정 " }],
      },
      coreSentences: [
        { index: 0, explanation: " 식물이 빛으로 필요한 물질을 만들어요. " },
        { index: -1, explanation: "제외" },
      ],
      essentialQuestions: [{
        index: 0,
        thinkingFocus: " 생물이 에너지를 얻는 여러 방법을 살펴봐요. ",
        perspectives: [" 원인 ", " 변화 ", ""],
      }],
    })).toEqual({
      coreIdea: {
        explanation: "식물이 빛을 이용하는 큰 원리를 알아봐요.",
        lifeConnection: "화분이 햇빛 쪽으로 자라는 모습을 떠올려 보세요.",
        keywords: [{ term: "광합성", meaning: "빛으로 양분을 만드는 과정" }],
      },
      coreSentences: [{ index: 0, explanation: "식물이 빛으로 필요한 물질을 만들어요." }],
      essentialQuestions: [{
        index: 0,
        thinkingFocus: "생물이 에너지를 얻는 여러 방법을 살펴봐요.",
        perspectives: ["원인", "변화"],
      }],
    });
  });

  it("중간 항목을 지우면 뒤 설명의 번호를 한 칸 당긴다", () => {
    const guides = {
      coreSentences: [
        { index: 0, explanation: "첫 문장 풀이" },
        { index: 1, explanation: "둘째 문장 풀이" },
        { index: 2, explanation: "셋째 문장 풀이" },
      ],
      essentialQuestions: [],
    };

    expect(removeIndexedStudentLearningGuide(guides, "coreSentences", 1)?.coreSentences).toEqual([
      { index: 0, explanation: "첫 문장 풀이" },
      { index: 1, explanation: "셋째 문장 풀이" },
    ]);
  });

  it("빈 원문을 저장에서 제외할 때 남은 설명 번호를 새 순서에 맞춘다", () => {
    const guides = {
      coreSentences: [{ index: 2, explanation: "셋째 문장 풀이" }],
      essentialQuestions: [{ index: 1, thinkingFocus: "둘째 질문 범위", perspectives: [] }],
    };

    expect(remapStudentLearningGuides(guides, [0, 2], [1])).toEqual({
      coreSentences: [{ index: 1, explanation: "셋째 문장 풀이" }],
      essentialQuestions: [{ index: 0, thinkingFocus: "둘째 질문 범위", perspectives: [] }],
    });
  });
});
