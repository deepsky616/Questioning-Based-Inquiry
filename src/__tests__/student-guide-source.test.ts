import { describe, expect, it } from "vitest";
import { buildStudentGuideSourceSignature } from "@/lib/student-guide-source";

const input = {
  coreIdea: "생물은 환경과 관계를 맺는다.",
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
});
