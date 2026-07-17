import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * 포인트 지급과 중복 판단에 쓰는 최종 정규화는 자료베이스 함수 하나를
 * 기준으로 삼아 실행 환경마다 글자 판정표가 달라지는 문제를 없앱니다.
 */
export async function normalizeContentForPersistence(content: string): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ normalizedContent: string }>>(
    Prisma.sql`
      SELECT public."normalize_activity_content"(${content}) AS "normalizedContent"
    `,
  );

  return rows[0]?.normalizedContent ?? "";
}
