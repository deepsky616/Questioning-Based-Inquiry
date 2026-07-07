import { describe, it, expect, vi } from "vitest";

// 라우트 모듈이 당기는 무거운 의존성 차단(순수 함수만 테스트)
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/api-rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn() }));
vi.mock("@google/generative-ai", () => ({ GoogleGenerativeAI: class {} }));

import { normalizeSequencedQuestions } from "@/app/api/unit-design/sequence/route";
import type { SequenceInputQuestion } from "@/lib/unit-sequence";

const SOURCE: SequenceInputQuestion[] = [
  { id: "a", content: "질문 A", cognitive: "factual", source: "student" },
  { id: "b", content: "질문 B", cognitive: "conceptual", source: "student" },
  { id: "c", content: "질문 C", cognitive: null, source: "teacher" },
];

describe("normalizeSequencedQuestions — AI 응답 방어 정규화", () => {
  it("merge 모드: mergedFrom의 유효한 원본 id만 내용으로 되매핑한다", () => {
    const out = normalizeSequencedQuestions(
      [{ id: "merged-1", content: "대표 질문", mergedFrom: ["a", "b", "지어낸-id", 7], priority: 1 }],
      SOURCE,
      "merge",
    );
    expect(out).toHaveLength(1);
    expect(out[0].mergedFrom).toEqual(["질문 A", "질문 B"]); // 잘못된 id는 걸러짐
  });

  it("merge 모드: mergedFrom이 전부 무효면 필드를 만들지 않는다", () => {
    const out = normalizeSequencedQuestions(
      [{ id: "merged-1", content: "대표", mergedFrom: ["없는-id"] }],
      SOURCE,
      "merge",
    );
    expect(out[0].mergedFrom).toBeUndefined();
  });

  it("sort 모드: mergedFrom은 무시된다", () => {
    const out = normalizeSequencedQuestions(
      [{ id: "a", content: "질문 A", mergedFrom: ["b"], priority: 1 }],
      SOURCE,
      "sort",
    );
    expect(out[0].mergedFrom).toBeUndefined();
  });

  it("priority 순으로 정렬 후 1부터 연속 번호를 다시 부여한다", () => {
    const out = normalizeSequencedQuestions(
      [
        { id: "a", content: "질문 A", priority: 9 },
        { id: "b", content: "질문 B", priority: 2 },
      ],
      SOURCE,
      "sort",
    );
    expect(out.map((q) => [q.content, q.priority])).toEqual([["질문 B", 1], ["질문 A", 2]]);
  });

  it("잘못된 항목(내용 없음·객체 아님)은 버린다", () => {
    const out = normalizeSequencedQuestions(
      [null, "문자열", { id: "없는-id" }, { id: "a" }],
      SOURCE,
      "sort",
    );
    // id=a는 원본 내용으로 복원, 나머지는 제거
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe("질문 A");
  });
});
