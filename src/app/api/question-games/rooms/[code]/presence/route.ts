import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { updateGameRoomPresence } from "@/lib/game-room-presence-service";
import { toPublicGameRoom } from "@/lib/question-game-room-response";
import type { GameRoom } from "@/lib/question-games-data";

type Params = { params: Promise<{ code: string }> };

function publicRoom(room: GameRoom) {
  return NextResponse.json({ room: toPublicGameRoom(room) });
}

function roomConflict(room: GameRoom) {
  return NextResponse.json(
    {
      error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.",
      room: toPublicGameRoom(room),
    },
    { status: 409 },
  );
}

function isValidExpectedCreatedAt(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const limited = checkRateLimit(`game-room-presence:${userId}`, 10);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다" },
      { status: 400 },
    );
  }
  const expectedCreatedAt =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).expectedCreatedAt
      : undefined;
  if (!isValidExpectedCreatedAt(expectedCreatedAt)) {
    return NextResponse.json(
      { error: "방 생성 시각이 올바르지 않습니다" },
      { status: 400 },
    );
  }

  const { code } = await params;
  try {
    const result = await updateGameRoomPresence({
      code,
      userId,
      expectedCreatedAt,
    });
    if (result.kind === "room") return publicRoom(result.room);
    if (result.kind === "conflict") return roomConflict(result.room);
    if (result.kind === "missing") {
      return NextResponse.json(
        { error: "방을 찾을 수 없습니다" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "방 참가자만 접속을 확인할 수 있어요" },
      { status: 403 },
    );
  } catch {
    return NextResponse.json(
      { error: "접속 상태를 확인할 수 없습니다" },
      { status: 500 },
    );
  }
}
