import { describe, it, expect } from "vitest";
import { normalizeSharedQuestions, groupSharedQuestions } from "@/lib/shared-questions";

describe("normalizeSharedQuestions", () => {
  it("누락된 contentGroup/priority/source를 기본값으로 채운다", () => {
    const result = normalizeSharedQuestions([
      { type: "factual", content: "A" },
      { type: "conceptual", content: "B" },
    ]);
    expect(result[0]).toEqual({ type: "factual", content: "A", contentGroup: "수업 순서", priority: 1, source: "student" });
    expect(result[1].priority).toBe(2);
  });

  it("주어진 값은 보존한다", () => {
    const result = normalizeSharedQuestions([
      { type: "student", content: "C", contentGroup: "광합성", priority: 5, source: "teacher" },
    ]);
    expect(result[0]).toEqual({ type: "student", content: "C", contentGroup: "광합성", priority: 5, source: "teacher" });
  });
});

describe("groupSharedQuestions", () => {
  it("contentGroup별로 묶고 그룹 내 priority 순, 그룹은 최소 priority 순으로 정렬한다", () => {
    const groups = groupSharedQuestions([
      { type: "factual", content: "에너지1", contentGroup: "에너지", priority: 3 },
      { type: "factual", content: "광합성2", contentGroup: "광합성", priority: 2 },
      { type: "factual", content: "광합성1", contentGroup: "광합성", priority: 1 },
    ]);
    expect(groups.map((g) => g.group)).toEqual(["광합성", "에너지"]);
    expect(groups[0].questions.map((q) => q.content)).toEqual(["광합성1", "광합성2"]);
  });

  it("그룹 정보가 없으면 단일 '수업 순서' 그룹으로 폴백한다", () => {
    const groups = groupSharedQuestions([{ type: "student", content: "X" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("수업 순서");
  });
});

describe("mergedFrom 관통", () => {
  it("normalize가 유효한 원본 질문 목록을 보존한다", () => {
    const [q] = normalizeSharedQuestions([
      { content: "대표 질문", mergedFrom: ["원본1", "원본2", "", 3 as unknown as string] },
    ]);
    expect(q.mergedFrom).toEqual(["원본1", "원본2"]);
  });

  it("mergedFrom이 없으면 필드를 만들지 않는다", () => {
    const [q] = normalizeSharedQuestions([{ content: "질문" }]);
    expect(q.mergedFrom).toBeUndefined();
  });

  it("그룹 결과에도 mergedFrom이 유지된다", () => {
    const groups = groupSharedQuestions([
      { content: "대표", contentGroup: "A", mergedFrom: ["원본1", "원본2"] },
      { content: "단독", contentGroup: "A" },
    ]);
    expect(groups[0].questions[0].mergedFrom).toEqual(["원본1", "원본2"]);
    expect(groups[0].questions[1].mergedFrom).toBeUndefined();
  });
});
