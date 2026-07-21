import { describe, expect, it } from "vitest";
import { buildQuestionGameLearningHistory } from "@/lib/question-game-history";

describe("질문놀이 학습 이력", () => {
  it("같은 친구 방의 여러 포인트 기록을 질문 수와 점수를 포함한 한 판으로 묶는다", () => {
    const history = buildQuestionGameLearningHistory({
      studentId: "student-1",
      runs: [],
      friendLogs: [
        { id: "p", gameId: "relay", roomCode: "room:1000:1:play", bonusType: "PARTICIPATION", points: 1, reason: "게임 참여", createdAt: new Date("2026-07-16T01:00:00Z") },
        { id: "q", gameId: "relay", roomCode: "room:1000:1:play", bonusType: "VALID_QUESTIONS", points: 0, reason: "유효 질문 3개", createdAt: new Date("2026-07-16T01:01:00Z") },
        { id: "c", gameId: "relay", roomCode: "room:1000:1:play", bonusType: "COMPLETION", points: 5, reason: "게임 완료", createdAt: new Date("2026-07-16T01:02:00Z") },
        { id: "l", gameId: "relay", roomCode: "room:1000:1:play", bonusType: "FRIEND_DAILY_LIMIT", points: 0, reason: "하루 상한", createdAt: new Date("2026-07-16T01:03:00Z") },
      ],
    });

    expect(history.recent).toEqual([expect.objectContaining({
      id: "friend:room:1000:1:play",
      gameId: "relay",
      mode: "friend",
      points: 6,
      goodQuestions: 3,
      completedAt: "2026-07-16T01:03:00.000Z",
    })]);
    expect(history.totals).toEqual({ plays: 1, points: 6, goodQuestions: 3 });
    expect(history.gameModes).toEqual([
      {
        gameId: "relay",
        modes: {
          solo: { plays: 0, completions: 0, participants: 0 },
          ai: { plays: 0, completions: 0, participants: 0 },
          friend: { plays: 1, completions: 1, participants: 1 },
        },
      },
    ]);
  });

  it("완료된 혼자 및 인공지능 실행을 최근 순서와 방식별로 집계한다", () => {
    const history = buildQuestionGameLearningHistory({
      studentId: "student-1",
      friendLogs: [],
      runs: [
        {
          id: "solo-run",
          gameId: "dice",
          mode: "SOLO",
          settledAt: new Date("2026-07-15T01:00:00Z"),
          activities: [
            { actorId: "student-1", validQuestionCount: 1 },
            { actorId: "student-1", validQuestionCount: 1 },
          ],
          pointLogs: [{ studentId: "student-1", points: 4 }],
        },
        {
          id: "ai-run",
          gameId: "kaba",
          mode: "AI",
          settledAt: new Date("2026-07-17T01:00:00Z"),
          activities: [{ actorId: "student-1", validQuestionCount: 1 }],
          pointLogs: [{ studentId: "student-1", points: 7 }],
        },
      ],
    });

    expect(history.recent.map(({ id }) => id)).toEqual(["run:ai-run", "run:solo-run"]);
    expect(history.modes.solo).toEqual({ plays: 1, points: 4, goodQuestions: 2 });
    expect(history.modes.ai).toEqual({ plays: 1, points: 7, goodQuestions: 1 });
    expect(history.modes.friend).toEqual({ plays: 0, points: 0, goodQuestions: 0 });
    expect(history.gameModes).toEqual([
      {
        gameId: "dice",
        modes: {
          solo: { plays: 1, completions: 1, participants: 1 },
          ai: { plays: 0, completions: 0, participants: 0 },
          friend: { plays: 0, completions: 0, participants: 0 },
        },
      },
      {
        gameId: "kaba",
        modes: {
          solo: { plays: 0, completions: 0, participants: 0 },
          ai: { plays: 1, completions: 1, participants: 1 },
          friend: { plays: 0, completions: 0, participants: 0 },
        },
      },
    ]);
  });
});
