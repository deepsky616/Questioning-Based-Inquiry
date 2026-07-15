import {
  deleteGameRoom,
  loadLockedGameRoom,
} from "@/lib/game-room-store";
import { logger } from "@/lib/logger";
import { parseGameRoom, type GameRoom } from "@/lib/question-games-data";

const HOUR_MS = 60 * 60 * 1_000;
const RECENT_PRESENCE_MS = 120 * 1_000;
const CREATE_ATTEMPT_RETENTION_MS = 60 * 1_000;
const OPPORTUNISTIC_CLEANUP_INTERVAL_MS = 15 * 60 * 1_000;
const CLEANUP_BATCH_SIZE = 100;

let nextOpportunisticCleanupAt = 0;

export type GameRoomCleanupResult = {
  deletedCount: number;
  errorCount: number;
};

type CleanupCandidate = {
  code: string;
  room: GameRoom;
};

export async function cleanupExpiredGameRooms({
  now = new Date(),
}: {
  now?: Date;
} = {}): Promise<GameRoomCleanupResult> {
  const { prisma } = await import("@/lib/db");
  const recentPresenceCutoff = new Date(now.getTime() - RECENT_PRESENCE_MS);
  let errorCount = 0;
  try {
    await prisma.gameRoomCreateAttempt.deleteMany({
      where: {
        createdAt: {
          lte: new Date(now.getTime() - CREATE_ATTEMPT_RETENTION_MS),
        },
      },
    });
  } catch {
    errorCount += 1;
  }

  const candidates = await prisma.gameRoom.findMany({
    where: {
      OR: [
        {
          updatedAt: { lte: new Date(now.getTime() - 6 * HOUR_MS) },
          data: { path: ["status"], equals: "waiting" },
          presences: {
            none: { lastSeenAt: { gte: recentPresenceCutoff } },
          },
        },
        {
          updatedAt: { lte: new Date(now.getTime() - 12 * HOUR_MS) },
          data: { path: ["status"], equals: "playing" },
          presences: {
            none: { lastSeenAt: { gte: recentPresenceCutoff } },
          },
        },
        {
          updatedAt: { lte: new Date(now.getTime() - 24 * HOUR_MS) },
          data: { path: ["status"], equals: "ended" },
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: CLEANUP_BATCH_SIZE,
    select: { code: true, data: true },
  });

  const parsedCandidates: CleanupCandidate[] = [];
  for (const candidate of candidates) {
    const room = parseGameRoom(candidate.data);
    if (
      !room ||
      room.code !== candidate.code ||
      !Number.isSafeInteger(room.createdAt)
    ) {
      errorCount += 1;
      continue;
    }
    parsedCandidates.push({ code: candidate.code, room });
  }

  let deletedCount = 0;
  for (const { code, room } of parsedCandidates) {
    try {
      const deleted = await prisma.$transaction(async (tx) => {
        const lockedRoom = await loadLockedGameRoom(code, tx);
        if (
          !lockedRoom ||
          lockedRoom.createdAt !== room.createdAt ||
          lockedRoom.version !== room.version
        ) {
          return false;
        }

        if (lockedRoom.status !== "ended") {
          const recentPresence = await tx.gameRoomPresence.findFirst({
            where: {
              roomCode: code,
              roomCreatedAt: BigInt(room.createdAt),
              lastSeenAt: { gte: recentPresenceCutoff },
            },
            select: { userId: true },
          });
          if (recentPresence) return false;
        }

        const result = await deleteGameRoom({
          code,
          createdAt: room.createdAt,
          version: room.version,
        }, tx);
        return result.kind === "deleted";
      });
      if (deleted) deletedCount += 1;
    } catch {
      errorCount += 1;
    }
  }

  const result = { deletedCount, errorCount };
  logger.info("질문놀이 방 정리", result);
  return result;
}

export async function cleanupExpiredGameRoomsIfDue({
  now = new Date(),
}: {
  now?: Date;
} = {}): Promise<GameRoomCleanupResult | null> {
  if (now.getTime() < nextOpportunisticCleanupAt) return null;

  nextOpportunisticCleanupAt =
    now.getTime() + OPPORTUNISTIC_CLEANUP_INTERVAL_MS;
  return cleanupExpiredGameRooms({ now });
}
