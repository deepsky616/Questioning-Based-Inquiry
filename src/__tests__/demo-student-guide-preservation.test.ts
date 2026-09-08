import { expect, it } from "vitest";
import { buildGuideUpdates } from "../../scripts/refresh-demo-student-guides.mjs";
import { buildGradeFiveDesign, GRADE_FIVE_LESSONS } from "../../scripts/demo-grade-five-content.mjs";

it("쉬운 설명을 갱신해도 수업 원문과 학생이 공유한 질문은 보존한다", () => {
  const designs = Object.keys(GRADE_FIVE_LESSONS).map(key => buildGradeFiveDesign({ key, unitDesignId: key }));
  const studentQuestion = { content: designs[0].inquiryQuestions[0].content, type: designs[0].inquiryQuestions[0].type, source: "student", mergedFrom: ["student-question"], studentGuide: { meaning: "학생 질문 안내" } };
  const sessions = designs.map((design, index) => ({ id: `s${index}`, unitDesignId: design.id, sharedQuestions: [{ ...design.inquiryQuestions[0], source: "teacher", priority: 1 }, ...(index === 0 ? [studentQuestion] : [])] }));
  const before = JSON.stringify({ designs, sessions });
  const plan = buildGuideUpdates(designs, sessions);
  expect(JSON.stringify({ designs, sessions })).toBe(before);
  expect(plan.sessions[0].data.sharedQuestions[1]).toEqual(studentQuestion);
  expect(plan.sessions[0].data.sharedQuestions[0]).toMatchObject({ content: designs[0].inquiryQuestions[0].content, priority: 1, source: "teacher" });
  expect(Object.keys(plan.designs[0].data).sort()).toEqual(["inquiryQuestions", "learningGuides"]);
  designs[0].coreSentences = ["교사가 새롭게 수정한 핵심 문장"];
  expect(() => buildGuideUpdates(designs, sessions)).toThrow("교사가 수정한 수업 내용");
});
