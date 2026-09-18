import { describe, it, expect } from "vitest";
import { normalizeSequencedQuestions, type SequenceInputQuestion } from "@/lib/unit-sequence";

const SOURCE: SequenceInputQuestion[] = [
  { id: "a", content: "식물은 왜 빛이 필요한가요?", cognitive: "conceptual", source: "student" },
  { id: "b", content: "햇빛이 식물에게 필요한 까닭은 무엇인가요?", cognitive: "conceptual", source: "student" },
  { id: "c", content: "식물을 키울 때 물은 얼마나 줘야 하나요?", cognitive: "factual", source: "teacher" },
];
const group = { content: "식물이 자라는 데 빛이 필요한 이유는 무엇인가요?", mergedFrom: ["a", "b"], contentGroup: "식물과 빛", priority: 1 };
const single = { content: "다른 질문으로 바꾸면 안 됩니다", mergedFrom: ["c"], contentGroup: "물의 양", priority: 2 };

describe("학생 원본을 빠짐없이 보존하는 질문 분류", () => {
  it("모든 원본이 한 번씩 포함된 묶음만 반환하고 단독 질문은 원문을 유지한다", () => {
    const result = normalizeSequencedQuestions([group, single], SOURCE, "merge");
    expect(result).toHaveLength(2);
    expect(result[0].mergedFrom).toEqual(SOURCE.slice(0, 2).map(q => q.content));
    expect(result[1]).toMatchObject({ content: SOURCE[2].content, source: "teacher", type: "factual" });
    expect(new Set(result.map(q => q.id)).size).toBe(2);
  });

  it.each([
    { items: [group] },
    { items: [group, { ...single, mergedFrom: ["a", "c"] }] },
    { items: [{ ...group, mergedFrom: ["a", "a", "b"] }, single] },
    { items: [{ ...group, mergedFrom: ["a", "b", "없는 질문"] }, single] },
    { items: [{ ...group, mergedFrom: [] }, single] },
    { items: [{ ...group, mergedFrom: undefined }, single] },
    { items: [{ ...group, content: " " }, single] },
    { items: [{ ...group, contentGroup: " " }, single] },
    { items: [null, group, single] },
  ])("누락·중복·알 수 없는 원본·잘못된 항목이 있으면 전체 결과를 거부한다: $items", ({ items }) => {
    expect(normalizeSequencedQuestions(items, SOURCE, "merge")).toEqual([]);
  });

  it("여러 학생이 같은 문장을 제출해도 서로 다른 원본으로 보존한다", () => {
    const originals = SOURCE.map(q => ({ ...q, content: "왜 빛이 필요한가요?" }));
    const result = normalizeSequencedQuestions([{ ...group, mergedFrom: ["a", "b", "c"] }], originals, "merge");
    expect(result[0].mergedFrom).toHaveLength(3);
    expect(result[0].source).toBe("student");
  });

  it("모델이 중복된 대표 번호를 반환해도 원본을 기준으로 고유 번호를 만든다", () => {
    const result = normalizeSequencedQuestions([{ ...group, id: "중복" }, { ...single, id: "중복" }], SOURCE, "merge");
    expect(new Set(result.map(q => q.id)).size).toBe(2);
  });

  it("정렬은 질문 내용·출처·묶음·원본 연결을 바꾸지 않는다", () => {
    const originals = SOURCE.map(q => ({ ...q, contentGroup: "교사 확정 묶음", mergedFrom: [q.content] }));
    const result = normalizeSequencedQuestions([
      { id: "c", content: "변조", source: "student", contentGroup: "새 묶음", priority: 1 },
      { id: "a", content: "변조", source: "teacher", priority: 3 },
      { id: "b", priority: 2 },
    ], originals, "sort");
    expect(result.map(q => q.id)).toEqual(["c", "b", "a"]);
    expect(result.map(q => q.priority)).toEqual([1, 2, 3]);
    for (const question of result) {
      const original = originals.find(q => q.id === question.id)!;
      expect(question).toMatchObject({ content: original.content, source: original.source, contentGroup: original.contentGroup, mergedFrom: original.mergedFrom });
    }
  });

  it.each([
    { items: [{ id: "a" }, { id: "a" }, { id: "c" }] },
    { items: [{ id: "a" }, { id: "b" }, { id: "없는 질문" }] },
    { items: [{ id: "a" }, { id: "b" }] },
    { items: [{ content: SOURCE[0].content }, { id: "b" }, { id: "c" }] },
  ])("정렬 결과는 개수가 같아도 원본 번호가 잘못되면 거부한다: $items", ({ items }) => {
    expect(normalizeSequencedQuestions(items, SOURCE, "sort")).toEqual([]);
  });
});
