import { describe, expect, it, vi } from "vitest";
import * as roomAwardLedger from "@/lib/question-game-room-award-ledger";
import type { GameRoom } from "@/lib/question-games-data";

function completedRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "dice",
    hostId: "student-1",
    status: "ended",
    players: [
      { id: "student-1", name: "학생", isHost: true, joinedAt: 1 },
    ],
    topic: "우주",
    chain: [],
    turnIndex: 0,
    gameState: {
      phase: "done",
      endReason: "completed",
      recentCommandIds: [],
    },
    version: 5,
    createdAt: 100,
    updatedAt: 200,
    ...overrides,
  };
}

function isVersion2Candidate(room: GameRoom) {
  const predicate = Reflect.get(
    roomAwardLedger,
    "isVersion2QuestionGameRoomCandidate",
  ) as unknown;
  expect(predicate).toBeTypeOf("function");
  return (predicate as (value: GameRoom) => boolean)(room);
}

function isCompletedVersion2Candidate(room: GameRoom) {
  const predicate = Reflect.get(
    roomAwardLedger,
    "isCompletedVersion2QuestionGameRoomCandidate",
  ) as unknown;
  expect(predicate).toBeTypeOf("function");
  return (predicate as (value: GameRoom) => boolean)(room);
}

function completedVersion2Room(): GameRoom {
  return completedRoom({
    playId: "00000000-0000-4000-8000-000000000004",
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
    gameState: {
      stateVersion: 2,
      phase: "done",
      endReason: "completed",
      recentCommandIds: [],
    },
  });
}

function settledAwardPredicate() {
  const predicate = Reflect.get(
    roomAwardLedger,
    "hasSettledQuestionGameRoomAward",
  ) as unknown;
  expect(predicate).toBeTypeOf("function");
  return predicate as (
    client: { gameRoomSettlement: { findUnique: ReturnType<typeof vi.fn> } },
    room: GameRoom,
  ) => Promise<boolean>;
}

describe("질문놀이 방 지급 장부 판정", () => {
  it.each([
    ["상태 버전", completedRoom({
      gameState: {
        stateVersion: 2,
        phase: "done",
        endReason: "completed",
        recentCommandIds: [],
      },
    })],
    ["점수 근거 버전", completedRoom({ pointEvidenceVersion: 2 })],
    ["점수 키 버전", completedRoom({ pointAwardKeyVersion: 2 })],
  ])("%s 하나만 2여도 버전 2 후보로 판정한다", (_name, room) => {
    expect(isVersion2Candidate(room)).toBe(true);
  });

  it("버전 2 표지가 없는 이전 완료 방은 후보가 아니다", () => {
    expect(isVersion2Candidate(completedRoom())).toBe(false);
  });

  it("완료 전 방도 버전 표지 하나가 2이면 버전 2 후보로 식별한다", () => {
    const room = completedRoom({
      status: "playing",
      pointEvidenceVersion: 2,
      gameState: { phase: "play", recentCommandIds: [] },
    });

    expect(isVersion2Candidate(room)).toBe(true);
    expect(isCompletedVersion2Candidate(room)).toBe(false);
  });

  it("상태 버전이 빠진 후보를 엄격한 지급 가능 완료 방으로 보지 않는다", () => {
    const room = completedRoom({
      playId: "00000000-0000-4000-8000-000000000004",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
    });

    expect(isVersion2Candidate(room)).toBe(true);
    expect(isCompletedVersion2Candidate(room)).toBe(true);
    expect(roomAwardLedger.isCompletedVersion2QuestionGameRoom(room)).toBe(false);
  });

  it.each(["AWARDED", "NO_ELIGIBLE_STUDENTS"])(
    "%s 정산 영수증이 있으면 완료된 지급으로 판정한다",
    async (outcome) => {
      const findUnique = vi.fn().mockResolvedValue({ outcome });

      await expect(settledAwardPredicate()(
        { gameRoomSettlement: { findUnique } },
        completedVersion2Room(),
      )).resolves.toBe(true);

      expect(findUnique).toHaveBeenCalledWith({
        where: {
          gameId_awardKey: {
            gameId: "dice",
            awardKey: "room:1234:100:00000000-0000-4000-8000-000000000004",
          },
        },
        select: { outcome: true },
      });
    },
  );

  it("정산 영수증이 없거나 결과가 알 수 없으면 미정산으로 판정한다", async () => {
    const predicate = settledAwardPredicate();

    await expect(predicate(
      { gameRoomSettlement: { findUnique: vi.fn().mockResolvedValue(null) } },
      completedVersion2Room(),
    )).resolves.toBe(false);
    await expect(predicate(
      {
        gameRoomSettlement: {
          findUnique: vi.fn().mockResolvedValue({ outcome: "UNKNOWN" }),
        },
      },
      completedVersion2Room(),
    )).resolves.toBe(false);
  });

  it("손상된 버전 2 후보 방은 영수증을 조회하지 않는다", async () => {
    const findUnique = vi.fn();
    const damagedRoom = completedVersion2Room();
    delete damagedRoom.gameState.stateVersion;

    await expect(settledAwardPredicate()(
      { gameRoomSettlement: { findUnique } },
      damagedRoom,
    )).resolves.toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
