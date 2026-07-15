import { prisma } from "@/lib/db";

const CREATE_LIMIT = 10;
const CREATE_WINDOW_MS = 60_000;

export async function consumeGameRoomCreateLimit(userId: string) {
  return prisma.$transaction(async (tx) => {
    const lockKey = `game-room-create:${userId}`;
    const rows = await tx.$queryRaw<Array<{ lock: string; now: Date }>>`
      WITH "locked" AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(
          hashtextextended(${lockKey}, 0)
        )::text AS "lock"
      )
      SELECT "lock", clock_timestamp() AS "now"
      FROM "locked"
    `;
    const now = rows[0]?.now;
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new Error("질문놀이 방 생성 제한 시각을 확인할 수 없습니다");
    }

    await tx.gameRoomCreateAttempt.deleteMany({
      where: {
        userId,
        createdAt: { lte: new Date(now.getTime() - CREATE_WINDOW_MS) },
      },
    });
    const recentAttempts = await tx.gameRoomCreateAttempt.count({
      where: { userId },
    });
    if (recentAttempts >= CREATE_LIMIT) return false;

    await tx.gameRoomCreateAttempt.create({
      data: { userId, createdAt: now },
    });
    return true;
  });
}
