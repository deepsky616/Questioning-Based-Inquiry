import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { lockAccountLifecycles } from "@/lib/account-lifecycle-lock";
import { prisma } from "@/lib/db";
import { cleanupExpiredGameRoomsIfDue } from "@/lib/game-room-cleanup-service";
import { consumeGameRoomCreateLimit } from "@/lib/game-room-create-rate-limit";
import { createGameRoom } from "@/lib/game-room-store";
import { logger } from "@/lib/logger";
import { toPublicGameRoom } from "@/lib/question-game-room-response";
import { isBuiltInQuestionGameId } from "@/lib/question-game-rules";

// 방 생성
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => ({}));
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  if (!gameId) {
    return NextResponse.json({ error: "gameId가 필요합니다" }, { status: 400 });
  }
  if (!isBuiltInQuestionGameId(gameId)) {
    return NextResponse.json({ error: "지원하지 않는 질문놀이입니다" }, { status: 400 });
  }

  let result:
    | { kind: "created"; room: NonNullable<Awaited<ReturnType<typeof createGameRoom>>> }
    | { kind: "forbidden" }
    | { kind: "limited" }
    | { kind: "code-exhausted" };
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockAccountLifecycles(tx, [userId]);
      const currentUser = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, role: true },
      });
      if (
        !currentUser ||
        (currentUser.role !== "STUDENT" && currentUser.role !== "TEACHER")
      ) {
        return { kind: "forbidden" } as const;
      }
      if (!await consumeGameRoomCreateLimit(userId, tx)) {
        return { kind: "limited" } as const;
      }
      const room = await createGameRoom({
        gameId,
        hostId: userId,
        hostName: currentUser.name,
      }, tx);
      return room
        ? { kind: "created", room } as const
        : { kind: "code-exhausted" } as const;
    });
  } catch {
    logger.error("질문놀이 방 생성 제한 오류", { errorCount: 1 });
    return NextResponse.json(
      { error: "방 생성 요청을 확인할 수 없습니다" },
      { status: 503 },
    );
  }

  if (result.kind === "forbidden") {
    return NextResponse.json(
      { error: "현재 계정으로는 방을 만들 수 없습니다" },
      { status: 403 },
    );
  }
  if (result.kind === "limited") {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }
  if (result.kind === "code-exhausted") {
    return NextResponse.json({ error: "방 코드 생성에 실패했습니다. 다시 시도해주세요." }, { status: 500 });
  }

  try {
    await cleanupExpiredGameRoomsIfDue();
  } catch {
    logger.warn("질문놀이 방 기회 정리 오류", { errorCount: 1 });
  }

  return NextResponse.json({ room: toPublicGameRoom(result.room) });
}
