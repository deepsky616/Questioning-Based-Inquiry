import { describe, expect, it } from "vitest";
import {
  issueQuestionGameAiProof,
  verifyQuestionGameAiProof,
} from "@/lib/question-game-ai-proof";

const SECRET = "question-game-proof-test-secret-value";
const NOW = new Date("2026-07-16T03:00:00.000Z");

function issueAt(now: Date) {
  return issueQuestionGameAiProof({
    runId: "run-1",
    ownerId: "student-1",
    runVersion: 2,
    leaseId: "00000000-0000-4000-8000-000000000051",
    generationRequestId: "00000000-0000-4000-8000-000000000031",
    topicHash: "a".repeat(64),
    previousQuestionHash: "b".repeat(64),
    outputHash: "c".repeat(64),
  }, SECRET, now);
}

describe("질문놀이 인공지능 차례 증명", () => {
  it("현재 시각에 발급한 증명은 확인한다", () => {
    const issued = issueAt(NOW);

    expect(verifyQuestionGameAiProof(issued.proof, SECRET, NOW)).toMatchObject({
      runId: "run-1",
      leaseId: "00000000-0000-4000-8000-000000000051",
    });
  });

  it("현재보다 지나치게 미래 시각에 발급된 증명은 거절한다", () => {
    const issued = issueAt(new Date(NOW.getTime() + 2 * 60 * 1_000));

    expect(() => verifyQuestionGameAiProof(issued.proof, SECRET, NOW)).toThrow();
  });
});
