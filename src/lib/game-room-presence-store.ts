import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { GameRoom } from "@/lib/question-games-data";

type RoomPresenceIdentity = {
  roomCode: string;
  roomCreatedAt: number;
  userId: string;
};

export type GameRoomPresenceClient = Pick<
  Prisma.TransactionClient,
  "gameRoomPresence"
>;

function roomCreatedAt(value: number) {
  return BigInt(value);
}

export async function initializeAndTouchGameRoomPresence({
  room,
  userId,
  now,
}: {
  room: GameRoom;
  userId: string;
  now: Date;
}, client: GameRoomPresenceClient = prisma) {
  const createdAt = roomCreatedAt(room.createdAt);

  await client.gameRoomPresence.createMany({
    data: room.players.map((player) => ({
      roomCode: room.code,
      roomCreatedAt: createdAt,
      userId: player.id,
      lastSeenAt: now,
    })),
    skipDuplicates: true,
  });

  await client.gameRoomPresence.upsert({
    where: {
      roomCode_roomCreatedAt_userId: {
        roomCode: room.code,
        roomCreatedAt: createdAt,
        userId,
      },
    },
    create: {
      roomCode: room.code,
      roomCreatedAt: createdAt,
      userId,
      lastSeenAt: now,
    },
    update: { lastSeenAt: now },
  });
}

export async function findStaleGameRoomParticipant({
  room,
  staleBefore,
}: {
  room: GameRoom;
  staleBefore: Date;
}, client: GameRoomPresenceClient = prisma) {
  if (room.players.length === 0) return null;

  const presence = await client.gameRoomPresence.findFirst({
    where: {
      roomCode: room.code,
      roomCreatedAt: roomCreatedAt(room.createdAt),
      userId: { in: room.players.map((player) => player.id) },
      lastSeenAt: { lt: staleBefore },
    },
    orderBy: [{ lastSeenAt: "asc" }, { userId: "asc" }],
    select: { userId: true },
  });

  return presence?.userId ?? null;
}

export async function isGameRoomPresenceStale({
  room,
  userId,
  staleBefore,
}: {
  room: GameRoom;
  userId: string;
  staleBefore: Date;
}, client: GameRoomPresenceClient = prisma) {
  const presence = await client.gameRoomPresence.findFirst({
    where: {
      roomCode: room.code,
      roomCreatedAt: roomCreatedAt(room.createdAt),
      userId,
      lastSeenAt: { lt: staleBefore },
    },
    select: { userId: true },
  });

  return presence !== null;
}

export async function deleteGameRoomPresence({
  roomCode,
  roomCreatedAt: createdAt,
  userId,
}: RoomPresenceIdentity, client: GameRoomPresenceClient = prisma) {
  await client.gameRoomPresence.deleteMany({
    where: {
      roomCode,
      roomCreatedAt: roomCreatedAt(createdAt),
      userId,
    },
  });
}
