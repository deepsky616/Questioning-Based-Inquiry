import type { Prisma } from "@prisma/client";

type PointUserLockTransaction = Pick<Prisma.TransactionClient, "$queryRaw">;

const POINT_USER_TRANSACTION_LOCK_NAMESPACE = "point-user-transaction";

export async function lockPointUserTransactions(
  tx: PointUserLockTransaction,
  userIds: readonly string[],
): Promise<void> {
  const sortedUserIds = Array.from(new Set(userIds)).sort();
  for (const userId of sortedUserIds) {
    const lockKey = `${POINT_USER_TRANSACTION_LOCK_NAMESPACE}:${userId}`;
    await tx.$queryRaw<Array<{ lock: string }>>`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${lockKey}, 0)
      )::text AS "lock"
    `;
  }
}
