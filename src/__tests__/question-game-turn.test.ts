import { describe, expect, it } from "vitest";
import { activeQuestionGamePlayerIds } from "@/lib/question-game-turn";
import type { GameRoom } from "@/lib/question-games-data";

const players = [
  { id: "student-1", name: "학생 1", isHost: true, joinedAt: 1 },
  { id: "student-2", name: "학생 2", isHost: false, joinedAt: 2 },
];

function room(
  gameId: string,
  gameState: Record<string, unknown>,
): GameRoom {
  return {
    code: "1234",
    gameId,
    hostId: "student-1",
    status: "playing",
    players,
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    playId: "10000000-0000-4000-8000-000000000001",
  };
}

describe("질문놀이 행동 차례 판별", () => {
  it("일곱 놀이에서 지금 행동할 참가자만 고른다", () => {
    const turnState = {
      phase: "question",
      turnOrder: ["student-1", "student-2"],
      currentTurnIdx: 1,
    };

    expect(activeQuestionGamePlayerIds(room("relay", turnState)))
      .toEqual(["student-2"]);
    expect(activeQuestionGamePlayerIds(room("dice", turnState)))
      .toEqual(["student-2"]);
    expect(activeQuestionGamePlayerIds(room("kaba", turnState)))
      .toEqual(["student-2"]);
    expect(activeQuestionGamePlayerIds(room("mystery-box", {
      ...turnState,
      phase: "play",
    }))).toEqual(["student-2"]);
    expect(activeQuestionGamePlayerIds(room("story-dice", {
      ...turnState,
      phase: "story",
      taggerId: "student-1",
    }))).toEqual(["student-1"]);
    expect(activeQuestionGamePlayerIds(room("memory", {
      phase: "rolling",
      diceRolls: { "student-1": 6 },
    }))).toEqual(["student-2"]);
    expect(activeQuestionGamePlayerIds(room("ladder", {
      phase: "compose",
      roundId: "round-1",
      roundTargetPlayerIds: ["student-1", "student-2"],
      questions: [{ roundId: "round-1", playerId: "student-1" }],
    }))).toEqual(["student-2"]);
  });

  it("끝난 방이나 방을 떠난 참가자는 차례로 알리지 않는다", () => {
    const ended = room("relay", {
      phase: "question",
      turnOrder: ["student-1"],
      currentTurnIdx: 0,
    });
    ended.status = "ended";
    expect(activeQuestionGamePlayerIds(ended)).toEqual([]);

    expect(activeQuestionGamePlayerIds(room("dice", {
      phase: "question",
      turnOrder: ["departed-student"],
      currentTurnIdx: 0,
    }))).toEqual([]);
  });
});
