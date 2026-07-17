import type { Prisma } from "@prisma/client";

type AccountLifecycleLockClient = Pick<Prisma.TransactionClient, "$queryRaw">;

const ACCOUNT_LIFECYCLE_LOCK_NAMESPACE = "account-lifecycle";

export async function lockAccountLifecycles(
  tx: AccountLifecycleLockClient,
  userIds: readonly string[],
) {
  const sortedUserIds = Array.from(
    new Set(userIds.filter((userId) => userId.length > 0)),
  ).sort();

  for (const userId of sortedUserIds) {
    const lockKey = `${ACCOUNT_LIFECYCLE_LOCK_NAMESPACE}:${userId}`;
    await tx.$queryRaw<Array<{ lock: string }>>`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${lockKey}, 0)
      )::text AS "lock"
    `;
  }
}
