import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { findCustomItemsForUser, rowsToBank } from "@/lib/practice-custom";

// 질문 연습에 병합할 교사 커스텀 문항 조회.
// 학생: 담당 교사(같은 학교 + 담당 학년·반)의 활성 문항 / 교사: 본인 활성 문항.
// 내장 은행은 클라이언트에 있으므로 여기서는 추가분만 내려준다.

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  try {
    const rows = await findCustomItemsForUser(session.user as { id: string; role?: string });
    return NextResponse.json(rowsToBank(rows));
  } catch (error) {
    logger.error("Practice bank fetch error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
