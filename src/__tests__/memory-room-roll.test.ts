import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const storeMocks = vi.hoisted(() => ({ saveGameRoom: vi.fn() }));

vi.mock("@/lib/game-room-store", () => ({
  saveGameRoom: storeMocks.saveGameRoom,
}));

import {
  recordMemoryRoll,
  settleMemoryRollingRoom,
} from "@/lib/memory-room-roll";

interface MemoryRoomOptions {
  version?: number;
  createdAt?: number;
  gameId?: string;
  phase?: string;
  players?: GameRoom["players"];
  diceRolls?: Record<string, number>;
  includeRoundId?: boolean;
}

function makeMemoryRoom(options: MemoryRoomOptions = {}): GameRoom {
  const players = options.players ?? [
    { id: "host", name: "방장", isHost: true, joinedAt: 1 },
    { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    { id: "user-1", name: "학생", isHost: false, joinedAt: 3 },
  ];

  return {
    code: "1234",
    gameId: options.gameId ?? "memory",
    hostId: players[0].id,
    status: "playing",
    players,
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {
      phase: options.phase ?? "rolling",
      diceRolls: options.diceRolls ?? {},
      ...(options.includeRoundId === false
        ? {}
        : { rollRoundId: "round-1" }),
      turnOrder: [],
      currentTurnIdx: 0,
    },
    version: options.version ?? 1,
    createdAt: options.createdAt ?? 10,
    updatedAt: options.createdAt ?? 10,
  };
}

function savedResult(room: GameRoom) {
  return {
    kind: "saved" as const,
    room: { ...room, version: room.version + 1 },
  };
}

beforeEach(() => {
  storeMocks.saveGameRoom.mockReset();
});

describe("recordMemoryRoll", () => {
  it("저장 충돌 뒤 최신 결과 지도에 현재 사용자 결과만 합친다", async () => {
    const initialRoom = makeMemoryRoom({ diceRolls: { host: 6 } });
    const latestRoom = makeMemoryRoom({
      version: 2,
      diceRolls: { host: 6, other: 4 },
    });
    storeMocks.saveGameRoom
      .mockResolvedValueOnce({ kind: "conflict", room: latestRoom })
      .mockImplementationOnce(async (room: GameRoom) => savedResult(room));

    const result = await recordMemoryRoll({
      initialRoom,
      userId: "user-1",
      roll: 5,
      rollRoundId: "round-1",
    });

    expect(result.kind).toBe("saved");
    expect(storeMocks.saveGameRoom).toHaveBeenCalledTimes(2);
    const secondCandidate = storeMocks.saveGameRoom.mock.calls[1][0] as GameRoom;
    expect(
      (secondCandidate.gameState as { diceRolls: Record<string, number> })
        .diceRolls,
    ).toEqual({ host: 6, other: 4, "user-1": 5 });
  });

  it("저장 충돌의 최신 방 생성 시각이 다르면 새 방에 다시 기록하지 않는다", async () => {
    const initialRoom = makeMemoryRoom();
    const replacement = makeMemoryRoom({ version: 1, createdAt: 20 });
    storeMocks.saveGameRoom.mockResolvedValueOnce({
      kind: "conflict",
      room: replacement,
    });

    await expect(
      recordMemoryRoll({
        initialRoom,
        userId: "user-1",
        roll: 5,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({
      kind: "conflict",
      room: replacement,
      reason: "lifetime",
    });
    expect(storeMocks.saveGameRoom).toHaveBeenCalledTimes(1);
  });

  it("같은 결과 재전송은 저장하지 않고 재생 결과를 반환한다", async () => {
    const room = makeMemoryRoom({
      version: 7,
      phase: "play",
      diceRolls: { host: 6, other: 4, "user-1": 5 },
    });

    await expect(
      recordMemoryRoll({
        initialRoom: room,
        userId: "user-1",
        roll: 5,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({
      kind: "replayed",
      room,
      roll: 5,
      replayed: true,
    });
    expect(room.version).toBe(7);
    expect(storeMocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("다른 결과 재전송은 첫 결과를 지키며 값 충돌을 반환한다", async () => {
    const room = makeMemoryRoom({ diceRolls: { "user-1": 3 } });

    await expect(
      recordMemoryRoll({
        initialRoom: room,
        userId: "user-1",
        roll: 5,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({ kind: "conflict", room, reason: "value" });
    expect(room.gameState.diceRolls).toEqual({ "user-1": 3 });
    expect(storeMocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("마지막 결과를 더한 같은 저장 후보에서 놀이 단계와 차례를 확정한다", async () => {
    const players = [
      { id: "b", name: "학생 비", isHost: true, joinedAt: 2 },
      { id: "a", name: "학생 에이", isHost: false, joinedAt: 1 },
      { id: "user-1", name: "학생", isHost: false, joinedAt: 3 },
    ];
    const room = makeMemoryRoom({
      players,
      diceRolls: { a: 4, b: 4 },
    });
    storeMocks.saveGameRoom.mockImplementationOnce(async (candidate: GameRoom) =>
      savedResult(candidate),
    );

    await recordMemoryRoll({
      initialRoom: room,
      userId: "user-1",
      roll: 6,
      rollRoundId: "round-1",
    });

    const savedCandidate = storeMocks.saveGameRoom.mock.calls[0][0] as GameRoom;
    expect(savedCandidate.gameState).toMatchObject({
      phase: "play",
      currentTurnIdx: 0,
      turnOrder: ["user-1", "a", "b"],
      diceRolls: { a: 4, b: 4, "user-1": 6 },
    });
  });

  it("세 번 저장 충돌 뒤 최신 방도 후보이면 재시도 소진을 반환한다", async () => {
    const latestRooms = [2, 3, 4].map((version) =>
      makeMemoryRoom({ version, diceRolls: { host: 6 } }),
    );
    for (const room of latestRooms) {
      storeMocks.saveGameRoom.mockResolvedValueOnce({
        kind: "conflict",
        room,
      });
    }

    await expect(
      recordMemoryRoll({
        initialRoom: makeMemoryRoom(),
        userId: "user-1",
        roll: 5,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({
      kind: "conflict",
      room: latestRooms[2],
      reason: "retry-exhausted",
    });
    expect(storeMocks.saveGameRoom).toHaveBeenCalledTimes(3);
  });

  it("세 번째 충돌의 최신 방에 같은 결과가 있으면 재생 결과를 반환한다", async () => {
    const firstLatest = makeMemoryRoom({ version: 2 });
    const secondLatest = makeMemoryRoom({ version: 3 });
    const finalLatest = makeMemoryRoom({
      version: 4,
      phase: "play",
      diceRolls: { host: 6, other: 4, "user-1": 5 },
    });
    storeMocks.saveGameRoom
      .mockResolvedValueOnce({ kind: "conflict", room: firstLatest })
      .mockResolvedValueOnce({ kind: "conflict", room: secondLatest })
      .mockResolvedValueOnce({ kind: "conflict", room: finalLatest });

    await expect(
      recordMemoryRoll({
        initialRoom: makeMemoryRoom(),
        userId: "user-1",
        roll: 5,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({
      kind: "replayed",
      room: finalLatest,
      roll: 5,
      replayed: true,
    });
    expect(storeMocks.saveGameRoom).toHaveBeenCalledTimes(3);
  });

  it("저장 중 방이 삭제되면 없음 결과를 반환한다", async () => {
    storeMocks.saveGameRoom.mockResolvedValueOnce({
      kind: "missing",
      room: null,
    });

    await expect(
      recordMemoryRoll({
        initialRoom: makeMemoryRoom(),
        userId: "user-1",
        roll: 5,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({ kind: "missing", room: null });
  });

  it("메모리 놀이가 아니면 잘못된 게임 결과를 반환한다", async () => {
    const room = makeMemoryRoom({ gameId: "question-chain" });

    await expect(
      recordMemoryRoll({
        initialRoom: room,
        userId: "user-1",
        roll: 5,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({ kind: "invalid", room, reason: "game" });
    expect(storeMocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("주사위 범위 밖 값이면 잘못된 결과를 반환한다", async () => {
    const room = makeMemoryRoom();

    await expect(
      recordMemoryRoll({
        initialRoom: room,
        userId: "user-1",
        roll: 7,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({ kind: "invalid", room, reason: "roll" });
    expect(storeMocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("공백이 붙은 라운드 식별값이면 잘못된 결과를 반환한다", async () => {
    const room = makeMemoryRoom();

    await expect(
      recordMemoryRoll({
        initialRoom: room,
        userId: "user-1",
        roll: 5,
        rollRoundId: " round-1",
      }),
    ).resolves.toEqual({ kind: "invalid", room, reason: "round" });
    expect(storeMocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("현재 참가자가 아니면 금지 결과를 반환한다", async () => {
    const room = makeMemoryRoom();

    await expect(
      recordMemoryRoll({
        initialRoom: room,
        userId: "gone",
        roll: 5,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({ kind: "forbidden", room });
    expect(storeMocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("값이 없는 놀이 단계에서는 단계 충돌을 반환한다", async () => {
    const room = makeMemoryRoom({ phase: "play" });

    await expect(
      recordMemoryRoll({
        initialRoom: room,
        userId: "user-1",
        roll: 5,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({ kind: "conflict", room, reason: "phase" });
    expect(storeMocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("요청과 방의 라운드가 다르면 라운드 충돌을 반환한다", async () => {
    const room = makeMemoryRoom();

    await expect(
      recordMemoryRoll({
        initialRoom: room,
        userId: "user-1",
        roll: 5,
        rollRoundId: "round-2",
      }),
    ).resolves.toEqual({ kind: "conflict", room, reason: "round" });
    expect(storeMocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("주사위 결과 지도가 손상되면 손상 결과를 반환한다", async () => {
    const room = makeMemoryRoom();
    room.gameState = {
      ...room.gameState,
      diceRolls: { host: 9 },
    };

    await expect(
      recordMemoryRoll({
        initialRoom: room,
        userId: "user-1",
        roll: 5,
        rollRoundId: "round-1",
      }),
    ).resolves.toEqual({ kind: "corrupt", room });
    expect(storeMocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("예전 진행 방에는 안정된 대체 라운드를 저장 후보에 넣는다", async () => {
    const room = makeMemoryRoom({ includeRoundId: false });
    storeMocks.saveGameRoom.mockImplementationOnce(async (candidate: GameRoom) =>
      savedResult(candidate),
    );

    const result = await recordMemoryRoll({
      initialRoom: room,
      userId: "user-1",
      roll: 5,
      rollRoundId: "legacy:1234:10",
    });

    expect(result.kind).toBe("saved");
    const candidate = storeMocks.saveGameRoom.mock.calls[0][0] as GameRoom;
    expect(candidate.gameState.rollRoundId).toBe("legacy:1234:10");
  });
});

describe("settleMemoryRollingRoom", () => {
  it("나간 참가자의 결과를 제거하고 남은 참가자의 차례를 확정한다", () => {
    const players = [
      { id: "later", name: "나중 학생", isHost: true, joinedAt: 2 },
      { id: "same-b", name: "학생 비", isHost: false, joinedAt: 1 },
      { id: "same-a", name: "학생 에이", isHost: false, joinedAt: 1 },
    ];
    const room = makeMemoryRoom({
      players,
      diceRolls: { gone: 6, later: 4, "same-b": 4, "same-a": 4 },
    });

    const settled = settleMemoryRollingRoom(room);

    expect(settled).not.toBe(room);
    expect(settled.gameState).toMatchObject({
      phase: "play",
      diceRolls: { later: 4, "same-b": 4, "same-a": 4 },
      turnOrder: ["same-a", "same-b", "later"],
      currentTurnIdx: 0,
    });
  });

  it("정리하거나 확정할 내용이 없으면 입력 객체를 그대로 반환한다", () => {
    const room = makeMemoryRoom({ diceRolls: { host: 6 } });

    expect(settleMemoryRollingRoom(room)).toBe(room);
  });

  it("진행 상태가 손상되면 입력 객체를 그대로 반환한다", () => {
    const room = makeMemoryRoom();
    room.gameState = { phase: "rolling", diceRolls: null };

    expect(settleMemoryRollingRoom(room)).toBe(room);
  });

  it("놀이 중 참가자가 나가도 남은 현재 차례 사용자를 유지한다", () => {
    const room = makeMemoryRoom({
      phase: "play",
      players: [
        { id: "host", name: "방장", isHost: true, joinedAt: 1 },
        { id: "current", name: "현재 학생", isHost: false, joinedAt: 3 },
      ],
      diceRolls: { gone: 6, host: 5, current: 4 },
    });
    room.gameState = {
      ...room.gameState,
      turnOrder: ["gone", "host", "current"],
      currentTurnIdx: 2,
      revealedIds: ["q-1"],
    };

    const settled = settleMemoryRollingRoom(room);

    expect(settled.gameState).toMatchObject({
      phase: "play",
      diceRolls: { host: 5, current: 4 },
      turnOrder: ["host", "current"],
      currentTurnIdx: 1,
      revealedIds: ["q-1"],
    });
  });
});
