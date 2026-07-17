import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const prismaMock = vi.hoisted(() => ({
  gameRoom: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
  },
  $executeRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import {
  createGameRoom,
  deleteGameRoom,
  loadGameRoom,
  saveGameRoom,
} from "@/lib/game-room-store";

function makeRoom(version = 1, createdAt = 1): GameRoom {
  return {
    code: "1234",
    gameId: "question-chain",
    hostId: "host",
    status: "waiting",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version,
    createdAt,
    updatedAt: 1,
  };
}

beforeEach(() => {
  prismaMock.gameRoom.findUnique.mockReset();
  prismaMock.gameRoom.updateMany.mockReset();
  prismaMock.gameRoom.deleteMany.mockReset();
  prismaMock.gameRoom.create.mockReset();
  prismaMock.gameRoom.createMany.mockReset();
  prismaMock.$executeRaw.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadGameRoom", () => {
  it("이전 방의 빈 버전은 1로 보정한 뒤 판별한다", async () => {
    prismaMock.gameRoom.findUnique.mockResolvedValue({
      data: { ...makeRoom(), version: null },
    });

    await expect(loadGameRoom("1234")).resolves.toMatchObject({ version: 1 });
  });

  it("놀이 식별값과 점수 버전 2를 읽는다", async () => {
    prismaMock.gameRoom.findUnique.mockResolvedValue({
      data: {
        ...makeRoom(),
        playId: "play-1",
        pointAwardKeyVersion: 2,
        pointEvidenceVersion: 2,
      },
    });

    await expect(loadGameRoom("1234")).resolves.toMatchObject({
      playId: "play-1",
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
    });
  });

  it.each(["", 3, null])("잘못된 놀이 식별값 %s는 읽지 않는다", async (playId) => {
    prismaMock.gameRoom.findUnique.mockResolvedValue({
      data: { ...makeRoom(), playId },
    });

    await expect(loadGameRoom("1234")).resolves.toBeNull();
  });

  it("알 수 없는 지급 키 버전은 이전 방으로 낮추지 않는다", async () => {
    prismaMock.gameRoom.findUnique.mockResolvedValue({
      data: { ...makeRoom(), pointAwardKeyVersion: 3 },
    });

    await expect(loadGameRoom("1234")).resolves.toBeNull();
  });

  it.each([
    ["지급 키", { pointAwardKeyVersion: null }],
    ["활동 증거", { pointEvidenceVersion: 3 }],
    ["활동 증거", { pointEvidenceVersion: null }],
  ])("잘못된 %s 버전은 읽지 않는다", async (_kind, versionFields) => {
    prismaMock.gameRoom.findUnique.mockResolvedValue({
      data: { ...makeRoom(), ...versionFields },
    });

    await expect(loadGameRoom("1234")).resolves.toBeNull();
  });
});

describe("saveGameRoom", () => {
  it("코드와 이전 버전이 맞으면 새 복사본을 저장한다", async () => {
    const room = makeRoom();
    const before = structuredClone(room);
    prismaMock.gameRoom.updateMany.mockResolvedValue({ count: 1 });

    const result = await saveGameRoom(room);

    expect(result.kind).toBe("saved");
    expect(result.room).toMatchObject({ code: "1234", version: 2 });
    expect(room).toEqual(before);
    expect(prismaMock.gameRoom.updateMany).toHaveBeenCalledWith({
      where: {
        code: "1234",
        AND: [
          { data: { path: ["version"], equals: 1 } },
          { data: { path: ["createdAt"], equals: 1 } },
        ],
      },
      data: {
        data: expect.objectContaining({ code: "1234", version: 2 }),
        updatedAt: expect.any(Date),
      },
    });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it("숫자 버전 충돌이면 최신 방을 다시 읽는다", async () => {
    const latest = makeRoom(3);
    prismaMock.gameRoom.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.gameRoom.findUnique.mockResolvedValue({ data: latest });

    await expect(saveGameRoom(makeRoom(2))).resolves.toEqual({
      kind: "conflict",
      room: latest,
    });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it("같은 코드와 버전이어도 생성 시각이 다르면 새 방을 덮지 않고 충돌을 반환한다", async () => {
    const stale = makeRoom(2, 1);
    const replacement = makeRoom(2, 2);
    prismaMock.gameRoom.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.gameRoom.findUnique.mockResolvedValue({ data: replacement });

    await expect(saveGameRoom(stale)).resolves.toEqual({
      kind: "conflict",
      room: replacement,
    });
    expect(prismaMock.gameRoom.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          code: "1234",
          AND: [
            { data: { path: ["version"], equals: 2 } },
            { data: { path: ["createdAt"], equals: 1 } },
          ],
        },
      }),
    );
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it("충돌 뒤 방이 없으면 missing을 반환한다", async () => {
    prismaMock.gameRoom.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.gameRoom.findUnique.mockResolvedValue(null);

    await expect(saveGameRoom(makeRoom(2))).resolves.toEqual({
      kind: "missing",
      room: null,
    });
  });

  it("기대 버전 1의 오래된 방만 안전한 보조 갱신을 쓴다", async () => {
    prismaMock.gameRoom.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.$executeRaw.mockResolvedValue(1);

    const result = await saveGameRoom(makeRoom(1));

    expect(result.kind).toBe("saved");
    const [strings, ...values] = prismaMock.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join("?");
    expect(sql).toContain('"game_rooms"');
    expect(sql).toContain('"updated_at" =');
    expect(sql).toContain("-> 'version' IS NULL");
    expect(sql).toContain("= 'null'::jsonb");
    expect(sql).toContain("-> 'createdAt' = ?::jsonb");
    expect(values).toContain("1");
  });
});

describe("deleteGameRoom", () => {
  it("코드와 이전 버전이 맞으면 삭제한다", async () => {
    prismaMock.gameRoom.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteGameRoom(makeRoom(2))).resolves.toEqual({
      kind: "deleted",
      room: null,
    });
    expect(prismaMock.gameRoom.deleteMany).toHaveBeenCalledWith({
      where: {
        code: "1234",
        AND: [
          { data: { path: ["version"], equals: 2 } },
          { data: { path: ["createdAt"], equals: 1 } },
        ],
      },
    });
  });

  it("삭제 충돌이면 최신 방을 반환한다", async () => {
    const latest = makeRoom(3);
    prismaMock.gameRoom.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.gameRoom.findUnique.mockResolvedValue({ data: latest });

    await expect(deleteGameRoom(makeRoom(2))).resolves.toEqual({
      kind: "conflict",
      room: latest,
    });
  });

  it("같은 코드와 버전이어도 생성 시각이 다르면 새 방을 삭제하지 않고 충돌을 반환한다", async () => {
    const stale = makeRoom(2, 1);
    const replacement = makeRoom(2, 2);
    prismaMock.gameRoom.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.gameRoom.findUnique.mockResolvedValue({ data: replacement });

    await expect(deleteGameRoom(stale)).resolves.toEqual({
      kind: "conflict",
      room: replacement,
    });
    expect(prismaMock.gameRoom.deleteMany).toHaveBeenCalledWith({
      where: {
        code: "1234",
        AND: [
          { data: { path: ["version"], equals: 2 } },
          { data: { path: ["createdAt"], equals: 1 } },
        ],
      },
    });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it("삭제 충돌 뒤 방이 없으면 missing을 반환한다", async () => {
    prismaMock.gameRoom.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.gameRoom.findUnique.mockResolvedValue(null);

    await expect(deleteGameRoom(makeRoom(2))).resolves.toEqual({
      kind: "missing",
      room: null,
    });
  });

  it("오래된 방 삭제는 안전한 보조 조건을 쓴다", async () => {
    prismaMock.gameRoom.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.$executeRaw.mockResolvedValue(1);

    await expect(deleteGameRoom(makeRoom(1))).resolves.toEqual({
      kind: "deleted",
      room: null,
    });
    const [strings, ...values] = prismaMock.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join("?");
    expect(sql).toContain('DELETE FROM "game_rooms"');
    expect(sql).toContain("-> 'version' IS NULL");
    expect(sql).toContain("= 'null'::jsonb");
    expect(sql).toContain("-> 'createdAt' = ?::jsonb");
    expect(values).toContain("1");
  });
});

describe("createGameRoom", () => {
  it("전달받은 거래 저장소에 방을 삽입한다", async () => {
    const transactionCreate = vi.fn();
    const transactionCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transactionClient = {
      gameRoom: {
        create: transactionCreate,
        createMany: transactionCreateMany,
      },
    };

    await createGameRoom({
      gameId: "question-chain",
      hostId: "host",
      hostName: "현재 방장",
    }, transactionClient as never);

    expect(transactionCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        data: expect.objectContaining({
          hostId: "host",
          players: [expect.objectContaining({ name: "현재 방장" })],
        }),
      })],
      skipDuplicates: true,
    });
    expect(transactionCreate).not.toHaveBeenCalled();
    expect(prismaMock.gameRoom.create).not.toHaveBeenCalled();
  });

  it("새 대기 방은 점수 버전을 넣지 않는다", async () => {
    prismaMock.gameRoom.createMany.mockResolvedValue({ count: 1 });

    const room = await createGameRoom({
      gameId: "question-chain",
      hostId: "host",
      hostName: "방장",
    });

    expect(room).not.toHaveProperty("pointAwardKeyVersion");
    expect(room).not.toHaveProperty("pointEvidenceVersion");
    expect(prismaMock.gameRoom.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        data: expect.not.objectContaining({
          pointAwardKeyVersion: expect.anything(),
          pointEvidenceVersion: expect.anything(),
        }),
      })],
      skipDuplicates: true,
    });
  });

  it("코드 겹침을 거래 오류로 만들지 않고 다음 후보로 생성한다", async () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.111);
    prismaMock.gameRoom.createMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const room = await createGameRoom({
      gameId: "question-chain",
      hostId: "host",
      hostName: "방장",
    });

    expect(room?.code).toBe("1999");
    expect(prismaMock.gameRoom.createMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.gameRoom.findUnique).not.toHaveBeenCalled();
  });

  it("생성 오류는 숨기지 않는다", async () => {
    const error = new Error("database unavailable");
    prismaMock.gameRoom.createMany.mockRejectedValue(error);

    await expect(
      createGameRoom({
        gameId: "question-chain",
        hostId: "host",
        hostName: "방장",
      }),
    ).rejects.toBe(error);
  });

  it("코드 겹침이 열두 번이면 null을 반환한다", async () => {
    prismaMock.gameRoom.createMany.mockResolvedValue({ count: 0 });

    await expect(
      createGameRoom({
        gameId: "question-chain",
        hostId: "host",
        hostName: "방장",
      }),
    ).resolves.toBeNull();
    expect(prismaMock.gameRoom.createMany).toHaveBeenCalledTimes(12);
  });
});
