import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { GameRoom, RoomPlayer } from "@/lib/question-games-data";

export type GameRoomWriteResult =
  | { kind: "saved"; room: GameRoom }
  | { kind: "conflict"; room: GameRoom }
  | { kind: "missing"; room: null };

export type GameRoomDeleteResult =
  | { kind: "deleted"; room: null }
  | { kind: "conflict"; room: GameRoom }
  | { kind: "missing"; room: null };

function gen4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function isStaleRoomAction(room: GameRoom, expectedVersion: unknown) {
  return typeof expectedVersion === "number" && expectedVersion !== room.version;
}

export async function loadGameRoom(code: string): Promise<GameRoom | null> {
  const rec = await prisma.gameRoom.findUnique({ where: { code } });
  if (!rec) return null;
  try {
    const room = rec.data as unknown as GameRoom;
    return { ...room, version: room.version ?? 1 };
  } catch {
    return null;
  }
}

export async function saveGameRoom(
  room: GameRoom,
): Promise<GameRoomWriteResult> {
  const expectedVersion = room.version ?? 1;
  const now = Date.now();
  const nextRoom: GameRoom = {
    ...room,
    version: expectedVersion + 1,
    updatedAt: now,
  };

  const updated = await prisma.gameRoom.updateMany({
    where: {
      code: room.code,
      AND: [
        { data: { path: ["version"], equals: expectedVersion } },
        { data: { path: ["createdAt"], equals: room.createdAt } },
      ],
    },
    data: {
      data: nextRoom as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(now),
    },
  });

  let count = updated.count;
  if (count === 0 && expectedVersion === 1) {
    count = await prisma.$executeRaw`
      UPDATE "game_rooms"
      SET
        "data" = ${JSON.stringify(nextRoom)}::jsonb,
        "updated_at" = ${new Date(now)}
      WHERE "code" = ${room.code}
        AND (
          "data" -> 'version' IS NULL
          OR "data" -> 'version' = 'null'::jsonb
        )
        AND "data" -> 'createdAt' = ${JSON.stringify(room.createdAt)}::jsonb
    `;
  }

  if (count === 1) return { kind: "saved", room: nextRoom };
  const current = await loadGameRoom(room.code);
  return current
    ? { kind: "conflict", room: current }
    : { kind: "missing", room: null };
}

export async function deleteGameRoom(
  room: Pick<GameRoom, "code" | "version" | "createdAt">,
): Promise<GameRoomDeleteResult> {
  const expectedVersion = room.version ?? 1;
  const deleted = await prisma.gameRoom.deleteMany({
    where: {
      code: room.code,
      AND: [
        { data: { path: ["version"], equals: expectedVersion } },
        { data: { path: ["createdAt"], equals: room.createdAt } },
      ],
    },
  });

  let count = deleted.count;
  if (count === 0 && expectedVersion === 1) {
    count = await prisma.$executeRaw`
      DELETE FROM "game_rooms"
      WHERE "code" = ${room.code}
        AND (
          "data" -> 'version' IS NULL
          OR "data" -> 'version' = 'null'::jsonb
        )
        AND "data" -> 'createdAt' = ${JSON.stringify(room.createdAt)}::jsonb
    `;
  }

  if (count === 1) return { kind: "deleted", room: null };
  const current = await loadGameRoom(room.code);
  return current
    ? { kind: "conflict", room: current }
    : { kind: "missing", room: null };
}

export async function createGameRoom({
  gameId,
  hostId,
  hostName,
}: {
  gameId: string;
  hostId: string;
  hostName: string;
}): Promise<GameRoom | null> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = gen4();
    const now = Date.now();
    const host: RoomPlayer = {
      id: hostId,
      name: hostName,
      isHost: true,
      joinedAt: now,
    };
    const room: GameRoom = {
      code,
      gameId,
      hostId,
      status: "waiting",
      players: [host],
      topic: "",
      chain: [],
      turnIndex: 0,
      gameState: {},
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await prisma.gameRoom.create({
        data: {
          code,
          data: room as unknown as Prisma.InputJsonValue,
        },
      });
      return room;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  return null;
}
