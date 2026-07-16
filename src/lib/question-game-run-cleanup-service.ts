import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const DAY_MS = 24 * 60 * 60 * 1_000;
const DELETION_RETENTION_MS = 7 * DAY_MS;
const CLEANUP_BATCH_SIZE = 100;
const MAX_CLEANUP_BATCHES = 10;

export type QuestionGameRunCleanupResult = {
  expiredCount: number;
  deletedCount: number;
};

export async function cleanupQuestionGameRuns({
  now = new Date(),
}: {
  now?: Date;
} = {}): Promise<QuestionGameRunCleanupResult> {
  const deletionCutoff = new Date(now.getTime() - DELETION_RETENTION_MS);
  let expiredCount = 0;
  let deletedCount = 0;

  for (let batch = 0; batch < MAX_CLEANUP_BATCHES; batch += 1) {
    const counts = await prisma.$transaction(async (tx) => {
      const expiredCandidates = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "game_runs"
        WHERE "status" = 'ACTIVE'
          AND "expires_at" <= ${now}
        ORDER BY "expires_at" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${CLEANUP_BATCH_SIZE}
      `;
      const expiredIds = expiredCandidates.map(({ id }) => id);
      const expiredCount = expiredIds.length > 0
        ? await tx.$executeRaw`
            UPDATE "game_runs"
            SET "status" = 'EXPIRED',
                "state" = "state" - 'aiGenerationLease',
                "version" = "version" + 1,
                "updated_at" = ${now}
            WHERE "id" IN (${Prisma.join(expiredIds)})
              AND "status" = 'ACTIVE'
              AND "expires_at" <= ${now}
          `
        : 0;

      const deletionCandidates = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT gr."id"
        FROM "game_runs" AS gr
        WHERE gr."status" IN ('EXPIRED', 'ABANDONED')
          AND gr."updated_at" <= ${deletionCutoff}
          AND NOT EXISTS (
            SELECT 1
            FROM "point_logs" AS pl
            WHERE pl."game_run_id" = gr."id"
          )
        ORDER BY gr."updated_at" ASC, gr."id" ASC
        FOR UPDATE OF gr SKIP LOCKED
        LIMIT ${CLEANUP_BATCH_SIZE}
      `;
      const deletionIds = deletionCandidates.map(({ id }) => id);
      const deleted = deletionIds.length > 0
        ? await tx.gameRun.deleteMany({
            where: {
              id: { in: deletionIds },
              status: { in: ["EXPIRED", "ABANDONED"] },
              updatedAt: { lte: deletionCutoff },
              pointLogs: { none: {} },
            },
          })
        : { count: 0 };

      return {
        expiredCount,
        deletedCount: deleted.count,
        hasFullBatch:
          expiredCandidates.length === CLEANUP_BATCH_SIZE ||
          deletionCandidates.length === CLEANUP_BATCH_SIZE,
      };
    });

    expiredCount += counts.expiredCount;
    deletedCount += counts.deletedCount;
    if (!counts.hasFullBatch) break;
  }

  const result = { expiredCount, deletedCount };
  logger.info("질문놀이 실행 정리", result);
  return result;
}
