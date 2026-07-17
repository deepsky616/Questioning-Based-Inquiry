import { NextResponse } from "next/server";
import { cleanupExpiredGameRooms } from "@/lib/game-room-cleanup-service";
import { logger } from "@/lib/logger";
import { inspectQuestionGameSettlements } from "@/lib/question-game-settlement-repair";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("질문놀이 방 정리 예약 오류", { errorCount: 1 });
    return NextResponse.json(
      { error: "예약 정리가 설정되지 않았습니다" },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "인증되지 않은 요청입니다" }, { status: 401 });
  }

  try {
    const settlementHealth = await inspectQuestionGameSettlements({
      repair: true,
      take: 100,
    });
    const result = await cleanupExpiredGameRooms();
    return NextResponse.json({
      ...result,
      settlementRepair: settlementHealth.summary,
    });
  } catch {
    logger.error("질문놀이 방 정리 예약 오류", { errorCount: 1 });
    return NextResponse.json({ error: "방 정리에 실패했습니다" }, { status: 500 });
  }
}
