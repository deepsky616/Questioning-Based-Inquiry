import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  loadGameRoom: vi.fn(),
  saveGameRoom: vi.fn(),
  deleteGameRoom: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/game-room-store", () => ({
  loadGameRoom: mocks.loadGameRoom,
  saveGameRoom: mocks.saveGameRoom,
  deleteGameRoom: mocks.deleteGameRoom,
  isStaleRoomAction: (room: GameRoom, expected: unknown) =>
    typeof expected === "number" && expected !== room.version,
}));

import { PATCH } from "@/app/api/question-games/rooms/[code]/route";

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "question-chain",
    hostId: "user-1",
    status: "waiting",
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
    ],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("http://localhost/api/question-games/rooms/1234", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ code: "1234" }) },
  );
}

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({
    user: { id: "user-1", name: "학생" },
  });
  mocks.loadGameRoom.mockReset();
  mocks.saveGameRoom.mockReset();
  mocks.deleteGameRoom.mockReset();
});

describe("일반 게임 동작 충돌", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["start", {}],
    ["update-state", { patch: { score: 1 } }],
    ["set-state", { state: { score: 1 } }],
    ["next-turn", {}],
    ["set-topic", { topic: "물" }],
    ["add-question", { question: "왜 그럴까?" }],
    ["end", {}],
    ["restart", {}],
  ];

  it.each(cases)(
    "%s 저장 충돌은 최신 방과 409를 반환한다",
    async (action, extra) => {
      const current = makeRoom();
      const latest = makeRoom({ version: 2, topic: "최신" });
      mocks.loadGameRoom.mockResolvedValue(current);
      mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

      const response = await patch({
        action,
        expectedVersion: 1,
        ...extra,
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ room: latest });
    },
  );

  it("저장 전에 방이 사라지면 404를 반환한다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom());
    mocks.saveGameRoom.mockResolvedValue({ kind: "missing", room: null });

    const response = await patch({
      action: "set-topic",
      expectedVersion: 1,
      topic: "물",
    });

    expect(response.status).toBe(404);
  });
});

it("동시 참가 충돌 뒤 최신 참가자 목록에 다시 추가한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  const latest = makeRoom({
    hostId: "host",
    version: 2,
    players: [
      { id: "host", name: "방장", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: latest })
    .mockImplementationOnce(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: 3 },
    }));

  const response = await patch({ action: "join" });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.room.players.map((player: { id: string }) => player.id)).toEqual([
    "host",
    "other",
    "user-1",
  ]);
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(2);
});

it("이미 참가한 사용자는 시작되고 가득 찬 방에서도 저장하지 않고 성공한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(
    makeRoom({
      status: "playing",
      players: Array.from({ length: 8 }, (_, index) => ({
        id: index === 0 ? "user-1" : `other-${index}`,
        name: `학생 ${index}`,
        isHost: index === 0,
        joinedAt: index,
      })),
    }),
  );

  const response = await patch({ action: "join" });

  expect(response.status).toBe(200);
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
});

it("참가 저장이 세 번 충돌하면 최신 방과 409를 반환한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
    kind: "conflict",
    room: { ...candidate, players: current.players },
  }));

  const response = await patch({ action: "join" });

  expect(response.status).toBe(409);
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(3);
});

it("세 번째 참가 충돌의 최신 방에 이미 참가했으면 성공한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  const pending = makeRoom({
    hostId: "host",
    version: 2,
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  const joined = makeRoom({
    hostId: "host",
    version: 3,
    players: [
      { id: "host", name: "방장", isHost: true, joinedAt: 1 },
      { id: "user-1", name: "학생", isHost: false, joinedAt: 3 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: pending })
    .mockResolvedValueOnce({ kind: "conflict", room: pending })
    .mockResolvedValueOnce({ kind: "conflict", room: joined });

  const response = await patch({ action: "join" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ room: joined });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(3);
});

it("참가 저장 중 방이 사라지면 404를 반환한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(
    makeRoom({
      hostId: "host",
      players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
    }),
  );
  mocks.saveGameRoom.mockResolvedValue({ kind: "missing", room: null });

  const response = await patch({ action: "join" });

  expect(response.status).toBe(404);
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(1);
});

it("마지막 참가자 삭제 충돌 뒤 최신 방에서 나가기를 다시 계산한다", async () => {
  const current = makeRoom();
  const latest = makeRoom({
    version: 2,
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.deleteGameRoom.mockResolvedValue({
    kind: "conflict",
    room: latest,
  });
  mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
    kind: "saved",
    room: { ...candidate, version: 3 },
  }));

  const response = await patch({ action: "leave" });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.room.hostId).toBe("other");
  expect(body.room.players).toEqual([
    expect.objectContaining({ id: "other", isHost: true }),
  ]);
});

it("이미 나간 사용자는 저장하지 않고 성공한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(
    makeRoom({
      hostId: "other",
      players: [
        { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
      ],
    }),
  );

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  expect(mocks.deleteGameRoom).not.toHaveBeenCalled();
});

it("이미 삭제된 방의 나가기는 성공한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(null);

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    room: null,
    deleted: true,
  });
});

it("나가기 저장이 세 번 충돌하면 최신 방과 409를 반환한다", async () => {
  const current = makeRoom({
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom.mockImplementation(async () => ({
    kind: "conflict",
    room: current,
  }));

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(409);
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(3);
});

it("세 번째 나가기 충돌의 최신 방에서 이미 나갔으면 성공한다", async () => {
  const current = makeRoom({
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  const pending = makeRoom({
    version: 2,
    players: current.players,
  });
  const left = makeRoom({
    hostId: "other",
    version: 3,
    players: [
      { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: pending })
    .mockResolvedValueOnce({ kind: "conflict", room: pending })
    .mockResolvedValueOnce({ kind: "conflict", room: left });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ room: left });
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(3);
});

it("나가기 저장 중 방이 사라지면 삭제 성공으로 처리한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(
    makeRoom({
      players: [
        { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
        { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
      ],
    }),
  );
  mocks.saveGameRoom.mockResolvedValue({ kind: "missing", room: null });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    room: null,
    deleted: true,
  });
});

it("마지막 참가자 삭제가 세 번 충돌하면 최신 방과 409를 반환한다", async () => {
  const current = makeRoom();
  const latest = makeRoom({ version: 4 });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.deleteGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: makeRoom({ version: 2 }) })
    .mockResolvedValueOnce({ kind: "conflict", room: makeRoom({ version: 3 }) })
    .mockResolvedValueOnce({ kind: "conflict", room: latest });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ room: latest });
  expect(mocks.deleteGameRoom).toHaveBeenCalledTimes(3);
});

it("마지막 참가자 삭제 중 방이 사라지면 성공한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(makeRoom());
  mocks.deleteGameRoom.mockResolvedValue({ kind: "missing", room: null });

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    room: null,
    deleted: true,
  });
});

it("로그인하지 않은 요청은 401을 반환한다", async () => {
  mocks.auth.mockResolvedValue(null);

  const response = await patch({ action: "start", expectedVersion: 1 });

  expect(response.status).toBe(401);
  expect(mocks.loadGameRoom).not.toHaveBeenCalled();
});

describe("기존 권한과 게임 규칙", () => {
  it.each(["start", "set-topic", "end", "restart"])(
    "방장이 아닌 사용자의 %s 요청은 403을 반환한다",
    async (action) => {
      mocks.auth.mockResolvedValue({
        user: { id: "other", name: "다른 학생" },
      });
      mocks.loadGameRoom.mockResolvedValue(makeRoom());

      const response = await patch({ action, expectedVersion: 1 });

      expect(response.status).toBe(403);
      expect(mocks.saveGameRoom).not.toHaveBeenCalled();
    },
  );

  it("시작된 방에 새로 참가할 수 없다", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "other", name: "다른 학생" },
    });
    mocks.loadGameRoom.mockResolvedValue(makeRoom({ status: "playing" }));

    const response = await patch({ action: "join" });

    expect(response.status).toBe(400);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("정원이 찬 방에 새로 참가할 수 없다", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "new-user", name: "새 학생" },
    });
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        hostId: "user-0",
        players: Array.from({ length: 8 }, (_, index) => ({
          id: `user-${index}`,
          name: `학생 ${index}`,
          isHost: index === 0,
          joinedAt: index,
        })),
      }),
    );

    const response = await patch({ action: "join" });

    expect(response.status).toBe(400);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("현재 차례가 아닌 사용자는 질문을 추가할 수 없다", async () => {
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        hostId: "other",
        players: [
          { id: "other", name: "다른 학생", isHost: true, joinedAt: 1 },
          { id: "user-1", name: "학생", isHost: false, joinedAt: 2 },
        ],
      }),
    );

    const response = await patch({
      action: "add-question",
      expectedVersion: 1,
      question: "왜 그럴까?",
    });

    expect(response.status).toBe(409);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });

  it("이미 나온 질문을 다시 추가할 수 없다", async () => {
    mocks.loadGameRoom.mockResolvedValue(
      makeRoom({
        chain: [
          {
            question: "왜 그럴까?",
            playerId: "user-1",
            playerName: "학생",
          },
        ],
      }),
    );

    const response = await patch({
      action: "add-question",
      expectedVersion: 1,
      question: "왜 그럴까?",
    });

    expect(response.status).toBe(400);
    expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  });
});
