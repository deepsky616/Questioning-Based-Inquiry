import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { practiceCustomItemSchema, rowsToBank, type PracticeCustomRow } from "@/lib/practice-custom";

const baseRow: PracticeCustomRow = {
  id: "r1",
  mode: "quiz",
  content: null,
  closure: null,
  cognitive: null,
  explanation: null,
  source: null,
  target: null,
  hint: null,
  example: null,
  title: null,
  passage: null,
};

describe("교사 커스텀 문항 — 입력 검증", () => {
  it("분류 문항: 질문·유형 2종·해설이 모두 있어야 한다", () => {
    expect(
      practiceCustomItemSchema.safeParse({
        mode: "quiz",
        content: "우리 반 규칙은 왜 필요할까요?",
        closure: "open",
        cognitive: "conceptual",
        explanation: "정답이 하나가 아니고 관계를 생각하는 질문이에요.",
      }).success,
    ).toBe(true);
    expect(
      practiceCustomItemSchema.safeParse({
        mode: "quiz",
        content: "우리 반 규칙은 왜 필요할까요?",
        closure: "open",
        cognitive: "conceptual",
      }).success,
    ).toBe(false);
  });

  it("바꾸기 문항: 목표 유형은 열린·개념적·논쟁적만 허용한다", () => {
    const base = {
      mode: "transform",
      source: "우리 반 규칙은 몇 개인가요?",
      hint: "찬반이 갈리는 상황을 만들어 보세요.",
      example: "규칙이 많은 반과 적은 반, 어느 쪽이 좋을까요?",
    };
    expect(practiceCustomItemSchema.safeParse({ ...base, target: "controversial" }).success).toBe(true);
    expect(practiceCustomItemSchema.safeParse({ ...base, target: "closed" }).success).toBe(false);
  });

  it("만들기 주제: 제시문은 30자 이상이어야 한다", () => {
    expect(
      practiceCustomItemSchema.safeParse({ mode: "create", title: "우리 학교", passage: "짧은 글" }).success,
    ).toBe(false);
    expect(
      practiceCustomItemSchema.safeParse({
        mode: "create",
        title: "우리 학교",
        passage: "우리 학교 운동장에는 오래된 나무가 있어요. 새 체육관을 지으려면 그 나무를 베어야 한다는 소식에 학생들의 생각이 갈려요.",
      }).success,
    ).toBe(true);
  });
});

describe("교사 커스텀 문항 — 은행 변환", () => {
  it("DB 행을 모드별 내장 은행 모양으로 바꾼다", () => {
    const bank = rowsToBank([
      { ...baseRow, id: "a", mode: "quiz", content: "질문?", closure: "open", cognitive: "conceptual", explanation: "해설" },
      { ...baseRow, id: "b", mode: "transform", source: "원본?", target: "open", hint: "힌트", example: "예시" },
      { ...baseRow, id: "c", mode: "create", title: "주제", passage: "제시문 내용" },
    ]);
    expect(bank.quiz).toEqual([{ id: "a", content: "질문?", closure: "open", cognitive: "conceptual", explanation: "해설" }]);
    expect(bank.transform[0]).toMatchObject({ id: "b", target: "open" });
    expect(bank.create[0]).toMatchObject({ id: "c", title: "주제" });
  });

  it("필수 필드가 빠진 행은 조용히 버린다 — 학생 연습이 깨지지 않게", () => {
    const bank = rowsToBank([
      { ...baseRow, id: "broken", mode: "quiz", content: "질문?", closure: null, cognitive: "factual", explanation: "해설" },
      { ...baseRow, id: "unknown", mode: "??" },
    ]);
    expect(bank.quiz).toHaveLength(0);
    expect(bank.transform).toHaveLength(0);
    expect(bank.create).toHaveLength(0);
  });
});
