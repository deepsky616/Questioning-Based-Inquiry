import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { GameRoom, RoomPlayer } from "@/lib/question-games-data";

const ROOM_KEY = (code: string) => `game_room_${code}`;

function gen6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 방 생성
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const userName = (session.user as { name?: string }).name ?? "학생";

  const body = await req.json().catch(() => ({}));
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  if (!gameId) {
    return NextResponse.json({ error: "gameId가 필요합니다" }, { status: 400 });
  }

  // 충돌 없는 6자리 코드 생성 (최대 8회 시도)
  let code = "";
  for (let i = 0; i < 8; i++) {
    const candidate = gen6();
    const existing = await prisma.systemConfig.findUnique({ where: { key: ROOM_KEY(candidate) } });
    if (!existing) { code = candidate; break; }
  }
  if (!code) {
    return NextResponse.json({ error: "방 코드 생성에 실패했습니다. 다시 시도해주세요." }, { status: 500 });
  }

  const now = Date.now();
  const host: RoomPlayer = { id: userId, name: userName, isHost: true, joinedAt: now };
  const room: GameRoom = {
    code,
    gameId,
    hostId: userId,
    status: "waiting",
    players: [host],
    topic: "",
    chain: [],
    turnIndex: 0,
    createdAt: now,
    updatedAt: now,
  };

  await prisma.systemConfig.upsert({
    where: { key: ROOM_KEY(code) },
    update: { value: JSON.stringify(room) },
    create: { key: ROOM_KEY(code), value: JSON.stringify(room) },
  });

  return NextResponse.json({ room });
}
