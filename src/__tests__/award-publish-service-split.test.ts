import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  isGameAwardResult,
  restorePublishableAwardResult,
  serializeGameAwardResultSnapshot,
} from "@/lib/game-award-result";

const pointAwardRoute = readFileSync("src/app/api/points/award/route.ts", "utf8");
const publishRoute = readFileSync("src/app/api/sessions/[id]/publish-questions/route.ts", "utf8");

describe("award and publish route service split", () => {
  it("keeps point award logic in a service module", () => {
    expect(existsSync("src/lib/point-award-service.ts")).toBe(true);
    const serviceSource = readFileSync("src/lib/point-award-service.ts", "utf8");
    expect(serviceSource).toContain("awardGamePoints");
    expect(serviceSource).toContain("buildAwardList");
    expect(pointAwardRoute).toContain("awardGamePoints");
    expect(pointAwardRoute.split("\n").length).toBeLessThan(90);
  });

  it("restores only public award fields and a validated analysis snapshot", () => {
    const snapshot = serializeGameAwardResultSnapshot({
      bestQuestion: {
        studentId: "student-1",
        question: "별은 왜 빛나나요?",
        reason: "탐구할 거리가 분명해요.",
      },
      summary: "서로의 질문을 잘 이어 갔어요.",
    });
    const restored = restorePublishableAwardResult([
      {
        id: "private-log-id",
        studentId: "student-1",
        bonusType: "PARTICIPATION",
        points: 5,
        reason: "게임 참여",
        aiAnalysis: snapshot,
        awardedById: "teacher-private-id",
      },
      {
        id: "private-best-id",
        studentId: "student-1",
        bonusType: "BEST_QUESTION",
        points: 3,
        reason: "좋은 질문",
        aiAnalysis: null,
      },
    ]);

    expect(restored).toEqual({
      awards: [
        {
          studentId: "student-1",
          bonusType: "PARTICIPATION",
          points: 5,
          reason: "게임 참여",
        },
        {
          studentId: "student-1",
          bonusType: "BEST_QUESTION",
          points: 3,
          reason: "좋은 질문",
        },
      ],
      bestQuestion: {
        studentId: "student-1",
        question: "별은 왜 빛나나요?",
        reason: "탐구할 거리가 분명해요.",
      },
      summary: "서로의 질문을 잘 이어 갔어요.",
    });
    expect(JSON.stringify(restored)).not.toContain("private");
    expect(isGameAwardResult(restored)).toBe(true);
  });

  it("rejects empty, malformed, duplicated, and out-of-scope award records", () => {
    expect(restorePublishableAwardResult([])).toBeNull();
    expect(restorePublishableAwardResult([{
      studentId: "student-1",
      bonusType: "PARTICIPATION",
      points: Number.NaN,
      reason: "게임 참여",
    }])).toBeNull();
    expect(restorePublishableAwardResult([
      { studentId: "student-1", bonusType: "PARTICIPATION", points: 5, reason: "게임 참여" },
      { studentId: "student-1", bonusType: "PARTICIPATION", points: 5, reason: "게임 참여" },
    ])).toBeNull();

    const foreignSnapshot = serializeGameAwardResultSnapshot({
      bestQuestion: {
        studentId: "student-2",
        question: "바다는 왜 파란가요?",
        reason: "좋은 질문이에요.",
      },
    });
    expect(restorePublishableAwardResult([{
      studentId: "student-1",
      bonusType: "PARTICIPATION",
      points: 5,
      reason: "게임 참여",
      aiAnalysis: foreignSnapshot,
    }])).toEqual({
      awards: [{
        studentId: "student-1",
        bonusType: "PARTICIPATION",
        points: 5,
        reason: "게임 참여",
      }],
    });
  });

  it("accepts only the exact public award result shape", () => {
    const result = {
      awards: [{
        studentId: "student-1",
        bonusType: "COMPLETION",
        points: 5,
        reason: "게임 완료",
      }],
      summary: "완료했어요.",
    };
    expect(isGameAwardResult(result)).toBe(true);
    expect(isGameAwardResult({ ...result, internalId: "hidden" })).toBe(false);
    expect(isGameAwardResult({
      ...result,
      awards: [{ ...result.awards[0], aiAnalysis: "hidden" }],
    })).toBe(false);
  });

  it("keeps published inquiry question logic in a service module", () => {
    expect(existsSync("src/lib/publish-questions-service.ts")).toBe(true);
    const serviceSource = readFileSync("src/lib/publish-questions-service.ts", "utf8");
    expect(serviceSource).toContain("getPublishedQuestions");
    expect(serviceSource).toContain("publishQuestionsToSession");
    expect(serviceSource).toContain("deletePublishedQuestions");
    expect(publishRoute).toContain("publishQuestionsToSession");
    expect(publishRoute.split("\n").length).toBeLessThan(120);
  });
});
