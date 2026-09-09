import { describe, expect, it } from "vitest";
import { primaryTeachingGrades, questionTeachingExamplesForGrades } from "@/lib/question-teaching-examples";

describe("학년별 질문 수업 예시와 성취기준 연결", () => {
  it("담당 학년을 중복 없이 정리하고 지원하지 않는 학년을 추정하지 않는다", () => {
    expect(primaryTeachingGrades(["5", " 5학년 ", "6", "중1", "", "0", "7"])).toEqual(["5", "6"]);
    expect(questionTeachingExamplesForGrades([])).toEqual({ status: "unassigned", grades: [], topics: [] });
  });

  it.each(["1", "2", "3", "4", "5", "6"])("%s학년에는 두 교과 예시와 해당 학년군의 실제 성취기준을 연결한다", grade => {
    const data = questionTeachingExamplesForGrades([grade]);
    expect(data.status).toBe("ready");
    expect(data.topics).toHaveLength(2);
    expect(new Set(data.topics.map(topic => topic.subject.ko)).size).toBe(2);
    for (const topic of data.topics) {
      expect(topic.grade).toBe(grade);
      expect(topic.standards.length).toBeGreaterThan(0);
      const bandEnd = Number(grade) <= 2 ? "2" : Number(grade) <= 4 ? "4" : "6";
      for (const standard of topic.standards) {
        expect(standard.code.startsWith(`[${bandEnd}`)).toBe(true);
        expect(standard.content.trim().length).toBeGreaterThan(10);
      }
      for (const text of [topic.subject, topic.unit, topic.setup, ...Object.values(topic.questions)]) {
        expect(text.ko.trim()).not.toBe("");
        expect(text.en.trim()).not.toBe("");
      }
      expect(new Set(Object.values(topic.questions).map(question => question.ko)).size).toBe(4);
    }
  });

  it("5학년에게 5~6학년군 코드를 연결해도 6학년 수업 예시를 섞지 않는다", () => {
    const data = questionTeachingExamplesForGrades(["5"]);
    expect(data.topics.map(topic => topic.unit.ko)).toEqual(["용해와 용액", "평균으로 자료 비교하기"]);
    expect(data.topics.flatMap(topic => topic.standards).find(item => item.code === "[6수04-01]")?.content).toBe("평균의 의미를 알고, 자료를 수집하여 평균을 구하고 해석할 수 있다.");
  });
});
