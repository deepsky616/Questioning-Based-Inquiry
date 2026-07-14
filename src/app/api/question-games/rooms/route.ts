import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createGameRoom } from "@/lib/game-room-store";
import { toPublicGameRoom } from "@/lib/question-game-room-response";
import { isBuiltInQuestionGameId } from "@/lib/question-game-rules";

// 방 생성
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const userName = (session.user as { name?: string }).name ?? "학생";

  const body = await req.json().catch(() => ({}));
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  if (!gameId) {
    return NextResponse.json({ error: "gameId가 필요합니다" }, { status: 400 });
  }
  if (!isBuiltInQuestionGameId(gameId)) {
    return NextResponse.json({ error: "지원하지 않는 질문놀이입니다" }, { status: 400 });
  }

  const room = await createGameRoom({ gameId, hostId: userId, hostName: userName });
  if (!room) {
    return NextResponse.json({ error: "방 코드 생성에 실패했습니다. 다시 시도해주세요." }, { status: 500 });
  }

  return NextResponse.json({ room: toPublicGameRoom(room) });
}
