import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureQuestionGameRoomPoints } from "@/lib/point-award-service";
import {
  parseGameRoom,
  pointParticipantsForRoom,
} from "@/lib/question-games-data";
import {
  hasSettledQuestionGameRoomAward,
  isCompletedVersion2QuestionGameRoom,
} from "@/lib/question-game-room-award-ledger";

export async function retryPendingQuestionGameRoomSettlementsForUser(
  userId: string,
): Promise<void> {
  let rows: Array<{ code: string; data: Prisma.JsonValue }>;
  try {
    rows = await prisma.gameRoom.findMany({
      orderBy: { code: "asc" },
      select: { code: true, data: true },
    });
  } catch {
    return;
  }

  for (const row of rows) {
    const room = parseGameRoom(row.data);
    if (
      !room ||
      room.code !== row.code ||
      !isCompletedVersion2QuestionGameRoom(room) ||
      !pointParticipantsForRoom(room).some((player) => player.id === userId)
    ) {
      continue;
    }

    try {
      if (await hasSettledQuestionGameRoomAward(prisma, room)) continue;
      await ensureQuestionGameRoomPoints(room);
    } catch {
      // 계정 삭제 거래가 잠근 최신 방과 장부를 다시 확인한다.
    }
  }
}
