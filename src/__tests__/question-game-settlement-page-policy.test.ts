import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/app/(teacher)/teacher-question-play/page.tsx",
  "utf8",
);

describe("교사 질문놀이 포인트 지급 상태 연결", () => {
  it("목록 조회와 수동 복구를 서로 다른 요청으로 연결한다", () => {
    expect(source).toContain("QuestionGameSettlementHealthPanel");
    expect(source).toContain(
      'fetchJson<unknown>("/api/teacher/question-games/settlements")',
    );
    expect(source).toContain('fetch("/api/teacher/question-games/settlements", {');
    expect(source).toContain('method: "POST"');
    expect(source).toContain("setSettlementHealth");
  });
});
