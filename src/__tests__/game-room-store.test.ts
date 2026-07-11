import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const prismaMock = vi.hoisted(() => ({
  gameRoom: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  $executeRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { deleteGameRoom, saveGameRoom } from "@/lib/game-room-store";

function makeRoom(version = 1): GameRoom {
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
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  prismaMock.gameRoom.findUnique.mockReset();
  prismaMock.gameRoom.updateMany.mockReset();
  prismaMock.gameRoom.deleteMany.mockReset();
  prismaMock.gameRoom.create.mockReset();
  prismaMock.$executeRaw.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
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
        data: { path: ["version"], equals: 1 },
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
    const [strings] = prismaMock.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join("?");
    expect(sql).toContain('"game_rooms"');
    expect(sql).toContain('"updated_at" =');
    expect(sql).toContain("-> 'version' IS NULL");
    expect(sql).toContain("= 'null'::jsonb");
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
        data: { path: ["version"], equals: 2 },
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
    const [strings] = prismaMock.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join("?");
    expect(sql).toContain('DELETE FROM "game_rooms"');
    expect(sql).toContain("-> 'version' IS NULL");
    expect(sql).toContain("= 'null'::jsonb");
  });
});
