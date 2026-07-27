import { describe, expect, it } from "vitest";
import {
  buildStudentGuideSourceSignature,
  withSelectedCoreIdea,
} from "@/lib/student-guide-source";

const input = {
  coreIdea: "생물은 환경과 관계를 맺는다.",
  selectedKeywords: ["생물", "환경"],
  coreSentences: ["생물은 서로 연결된다."],
  essentialQuestions: ["생태계는 어떻게 유지될까?"],
  inquiryQuestions: [{ type: "factual" as const, content: "생산자는 무엇일까?" }],
};

describe("학생용 설명 원문 서명", () => {
  it("공백을 정리한 같은 원문에는 같은 서명을 만든다", () => {
    expect(buildStudentGuideSourceSignature(input)).toBe(buildStudentGuideSourceSignature({
      ...input,
      coreIdea: "  생물은 환경과 관계를 맺는다.  ",
    }));
  });

  it("질문 내용이나 유형이 바뀌면 다른 서명을 만든다", () => {
    expect(buildStudentGuideSourceSignature(input)).not.toBe(buildStudentGuideSourceSignature({
      ...input,
      inquiryQuestions: [{ type: "conceptual", content: "생산자는 무엇일까?" }],
    }));
  });

  it("선택한 핵심 낱말이 바뀌면 다른 서명을 만든다", () => {
    expect(buildStudentGuideSourceSignature(input)).not.toBe(buildStudentGuideSourceSignature({
      ...input,
      selectedKeywords: ["생물", "관계"],
    }));
  });

  it("성취기준 번호나 내용이 바뀌면 다른 서명을 만든다", () => {
    const first = {
      ...input,
      achievements: [{ code: "[6과05-01]", content: "생태계 구성 요소를 조사할 수 있다." }],
    };
    const changed = {
      ...input,
      achievements: [{ code: "[6과05-02]", content: "생물과 환경의 관계를 설명할 수 있다." }],
    };

    expect(buildStudentGuideSourceSignature(first))
      .not.toBe(buildStudentGuideSourceSignature(changed));
  });

  it("저장 자료의 핵심 생각은 선택한 줄을 합친 값과 일치한다", () => {
    const payload = withSelectedCoreIdea(
      { title: "생태계", coreIdea: "선택하지 않은 전체 핵심 생각" },
      ["선택한 첫 줄", "선택한 둘째 줄"],
    );

    expect(payload).toEqual({
      title: "생태계",
      coreIdea: "선택한 첫 줄\n선택한 둘째 줄",
    });
  });
});
