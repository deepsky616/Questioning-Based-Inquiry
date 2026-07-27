import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DemoAiQuotaError } from "@/lib/ai-errors";

const DEFAULT_DAILY_LIMIT = 120;
const MAX_DAILY_LIMIT = 1_000;

export function demoUsageDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dailyLimit(): number {
  const parsed = Number(process.env.DEMO_AI_DAILY_LIMIT);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_DAILY_LIMIT
    ? parsed
    : DEFAULT_DAILY_LIMIT;
}

export async function consumeDemoAiQuota(
  userId: string,
  now = new Date(),
): Promise<number> {
  const usageDate = demoUsageDate(now);
  const limit = dailyLimit();
  const rows = await prisma.$queryRaw<Array<{ requestCount: number }>>(Prisma.sql`
    INSERT INTO "demo_ai_daily_usages" (
      "user_id",
      "usage_date",
      "request_count",
      "created_at",
      "updated_at"
    )
    VALUES (${userId}, ${usageDate}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("user_id", "usage_date")
    DO UPDATE SET
      "request_count" = "demo_ai_daily_usages"."request_count" + 1,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "demo_ai_daily_usages"."request_count" < ${limit}
    RETURNING "request_count" AS "requestCount"
  `);

  const requestCount = rows[0]?.requestCount;
  if (!requestCount) throw new DemoAiQuotaError();
  return requestCount;
}
