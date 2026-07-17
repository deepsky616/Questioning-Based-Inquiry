import { describe, expect, it } from "vitest";
import {
  hashPracticeGenerationContent,
  issuePracticeGenerationProof,
  verifyPracticeGenerationProof,
} from "@/lib/practice-generation-proof";

const SECRET = "practice-generation-proof-test-secret";
const NOW = new Date("2026-07-16T12:00:00.000Z");

describe("실시간 생성 연습 증명", () => {
  it("사용자와 모드, 목표, 원문 지문, 무작위 생성 식별값을 서명한다", () => {
    const issued = issuePracticeGenerationProof({
      userId: "student-1",
      mode: "transform",
      target: "open",
      content: "우리나라의 수도는 어디인가요?",
    }, SECRET, NOW);

    const verified = verifyPracticeGenerationProof(issued.proof, SECRET, NOW);

    expect(verified).toMatchObject({
      userId: "student-1",
      mode: "transform",
      target: "open",
      contentHash: hashPracticeGenerationContent("우리나라의 수도는 어디인가요?"),
      generationId: issued.generationId,
    });
  });

  it("서명이나 본문을 바꾼 증명은 거부한다", () => {
    const issued = issuePracticeGenerationProof({
      userId: "student-1",
      mode: "create",
      content: "충분히 긴 제시문입니다. 서로 다른 생각을 나눌 수 있는 상황도 함께 들어 있습니다.",
    }, SECRET, NOW);

    expect(() => verifyPracticeGenerationProof(`${issued.proof}x`, SECRET, NOW))
      .toThrow();
  });

  it("만료된 증명은 거부한다", () => {
    const issued = issuePracticeGenerationProof({
      userId: "student-1",
      mode: "transform",
      target: "conceptual",
      content: "물은 몇 도에서 얼까요?",
    }, SECRET, NOW);

    expect(() => verifyPracticeGenerationProof(
      issued.proof,
      SECRET,
      new Date(NOW.getTime() + 24 * 60 * 60 * 1_000),
    )).toThrow();
  });
});
