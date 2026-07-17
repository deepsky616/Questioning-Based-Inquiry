import {
  deleteGameRoom,
  loadLockedGameRoom,
} from "@/lib/game-room-store";
import { logger } from "@/lib/logger";
import { parseGameRoom, type GameRoom } from "@/lib/question-games-data";
import { ensureQuestionGameRoomPoints } from "@/lib/point-award-service";
import {
  hasSettledQuestionGameRoomAward,
  isCompletedVersion2QuestionGameRoomCandidate,
  isCompletedVersion2QuestionGameRoom,
} from "@/lib/question-game-room-award-ledger";

const HOUR_MS = 60 * 60 * 1_000;
const RECENT_PRESENCE_MS = 120 * 1_000;
const CREATE_ATTEMPT_RETENTION_MS = 60 * 1_000;
const OPPORTUNISTIC_CLEANUP_INTERVAL_MS = 15 * 60 * 1_000;
const CLEANUP_BATCH_SIZE = 100;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let nextOpportunisticCleanupAt = 0;

export type GameRoomCleanupResult = {
  deletedCount: number;
  errorCount: number;
};

type CleanupCandidate = {
  code: string;
  room: GameRoom;
};

type CleanupRoomOutcome = "deleted" | "preserved" | "settlement-error";

function canRetryQuestionGameRoomSettlement(room: GameRoom) {
  return isCompletedVersion2QuestionGameRoom(room) &&
    room.pointAwardKeyVersion === 2 &&
    room.pointEvidenceVersion === 2 &&
    typeof room.playId === "string" &&
    UUID_V4_PATTERN.test(room.playId);
}

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
    let settlementAttemptFailed = false;
    if (canRetryQuestionGameRoomSettlement(room)) {
      try {
        await ensureQuestionGameRoomPoints(room);
      } catch {
        settlementAttemptFailed = true;
      }
    }
    try {
      const outcome = await prisma.$transaction(async (tx): Promise<CleanupRoomOutcome> => {
        const lockedRoom = await loadLockedGameRoom(code, tx);
        if (
          !lockedRoom ||
          lockedRoom.createdAt !== room.createdAt ||
          lockedRoom.version !== room.version
        ) {
          return "preserved";
        }

        if (isCompletedVersion2QuestionGameRoomCandidate(lockedRoom)) {
          if (!canRetryQuestionGameRoomSettlement(lockedRoom)) {
            return "preserved";
          }
          if (!await hasSettledQuestionGameRoomAward(tx, lockedRoom)) {
            return settlementAttemptFailed
              ? "settlement-error"
              : "preserved";
          }
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
          if (recentPresence) return "preserved";
        }

        const result = await deleteGameRoom({
          code,
          createdAt: room.createdAt,
          version: room.version,
        }, tx);
        return result.kind === "deleted" ? "deleted" : "preserved";
      });
      if (outcome === "deleted") {
        deletedCount += 1;
      } else if (outcome === "settlement-error") {
        errorCount += 1;
        logger.warn("질문놀이 방 정산 오류", {
          roomCode: code,
          errorCount: 1,
        });
      }
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
