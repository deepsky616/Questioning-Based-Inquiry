import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  parseGameRoom,
  type GameRoom,
  type RoomPlayer,
} from "@/lib/question-games-data";

export { deleteGameRoomPresence } from "@/lib/game-room-presence-store";

export type GameRoomWriteResult =
  | { kind: "saved"; room: GameRoom }
  | { kind: "conflict"; room: GameRoom }
  | { kind: "missing"; room: null };

export type GameRoomDeleteResult =
  | { kind: "deleted"; room: null }
  | { kind: "conflict"; room: GameRoom }
  | { kind: "missing"; room: null };

export type GameRoomStoreClient = Pick<
  Prisma.TransactionClient,
  "gameRoom" | "$executeRaw" | "$queryRaw"
>;

function gen4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function isStaleRoomAction(room: GameRoom, expectedVersion: unknown) {
  return typeof expectedVersion === "number" && expectedVersion !== room.version;
}

export async function loadGameRoom(
  code: string,
  client: GameRoomStoreClient = prisma,
): Promise<GameRoom | null> {
  const rec = await client.gameRoom.findUnique({ where: { code } });
  if (!rec) return null;
  return parseGameRoom(rec.data);
}

export async function loadLockedGameRoom(
  code: string,
  client: GameRoomStoreClient,
): Promise<GameRoom | null> {
  const records = await client.$queryRaw<Array<{ data: Prisma.JsonValue }>>`
    SELECT "data"
    FROM "game_rooms"
    WHERE "code" = ${code}
    FOR UPDATE
  `;
  const record = records[0];
  return record ? parseGameRoom(record.data) : null;
}

export async function saveGameRoom(
  room: GameRoom,
  client: GameRoomStoreClient = prisma,
): Promise<GameRoomWriteResult> {
  const expectedVersion = room.version ?? 1;
  const now = Date.now();
  const nextRoom: GameRoom = {
    ...room,
    version: expectedVersion + 1,
    updatedAt: now,
  };

  const updated = await client.gameRoom.updateMany({
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
    count = await client.$executeRaw`
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
  const current = await loadGameRoom(room.code, client);
  return current
    ? { kind: "conflict", room: current }
    : { kind: "missing", room: null };
}

/**
 * 낮은 수준의 수명 일치 삭제입니다. 완료된 버전 2 방은 호출 전에
 * 정산 영수증을 확인한 보호 경로를 반드시 거쳐야 합니다.
 */
export async function deleteGameRoom(
  room: Pick<GameRoom, "code" | "version" | "createdAt">,
  client: GameRoomStoreClient = prisma,
): Promise<GameRoomDeleteResult> {
  const expectedVersion = room.version ?? 1;
  const deleted = await client.gameRoom.deleteMany({
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
    count = await client.$executeRaw`
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
  const current = await loadGameRoom(room.code, client);
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
}, client: GameRoomStoreClient = prisma): Promise<GameRoom | null> {
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

    const inserted = await client.gameRoom.createMany({
      data: [{
        code,
        data: room as unknown as Prisma.InputJsonValue,
      }],
      skipDuplicates: true,
    });
    if (inserted.count === 1) return room;
  }

  return null;
}
