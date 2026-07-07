import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { GameRoom, RoomPlayer, RoomChainItem } from "@/lib/question-games-data";

const ROOM_KEY = (code: string) => `game_room_${code}`;

async function loadRoom(code: string): Promise<GameRoom | null> {
  const rec = await prisma.systemConfig.findUnique({ where: { key: ROOM_KEY(code) } });
  if (!rec) return null;
  try {
    return JSON.parse(rec.value) as GameRoom;
  } catch {
    return null;
  }
}

async function saveRoom(room: GameRoom) {
  room.updatedAt = Date.now();
  await prisma.systemConfig.update({
    where: { key: ROOM_KEY(room.code) },
    data: { value: JSON.stringify(room) },
  });
}

// 방 상태 조회 (폴링)
export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const room = await loadRoom(params.code);
  if (!room) {
    return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json({ room });
}

// 방 액션 (참가/시작/주제설정/질문추가/종료/나가기)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const userName = (session.user as { name?: string }).name ?? "학생";

  const room = await loadRoom(params.code);
  if (!room) {
    return NextResponse.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  switch (action) {
    case "join": {
      if (room.status !== "waiting") {
        return NextResponse.json({ error: "이미 시작된 방이에요" }, { status: 400 });
      }
      if (room.players.length >= 8) {
        return NextResponse.json({ error: "방이 가득 찼어요 (최대 8명)" }, { status: 400 });
      }
      if (!room.players.some((p) => p.id === userId)) {
        const player: RoomPlayer = { id: userId, name: userName, isHost: false, joinedAt: Date.now() };
        room.players.push(player);
        await saveRoom(room);
      }
      break;
    }

    case "leave": {
      const wasHost = room.hostId === userId;
      room.players = room.players.filter((p) => p.id !== userId);
      if (room.players.length === 0) {
        // 모두 나가면 방 삭제
        await prisma.systemConfig.delete({ where: { key: ROOM_KEY(room.code) } }).catch(() => {});
        return NextResponse.json({ room: null, deleted: true });
      }
      // 방장이 나가면 다음 사람에게 위임
      if (wasHost) {
        room.hostId = room.players[0].id;
        room.players[0].isHost = true;
      }
      await saveRoom(room);
      break;
    }

    case "start": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 시작할 수 있어요" }, { status: 403 });
      }
      room.status = "playing";
      room.turnIndex = 0;
      room.chain = [];
      room.gameState = {};
      await saveRoom(room);
      break;
    }

    case "update-state": {
      // gameState 부분 병합 (참가자 누구나 자기 액션 반영 가능)
      const patch = (body.patch ?? {}) as Record<string, unknown>;
      room.gameState = { ...room.gameState, ...patch };
      if (typeof body.turnIndex === "number") room.turnIndex = body.turnIndex;
      if (typeof body.status === "string" && (body.status === "playing" || body.status === "ended")) {
        room.status = body.status;
      }
      await saveRoom(room);
      break;
    }

    case "set-state": {
      // gameState 전체 교체 (주로 방장이 초기화/리셋)
      room.gameState = (body.state ?? {}) as Record<string, unknown>;
      if (typeof body.turnIndex === "number") room.turnIndex = body.turnIndex;
      await saveRoom(room);
      break;
    }

    case "next-turn": {
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      await saveRoom(room);
      break;
    }

    case "set-topic": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 주제를 정할 수 있어요" }, { status: 403 });
      }
      room.topic = typeof body.topic === "string" ? body.topic : "";
      await saveRoom(room);
      break;
    }

    case "add-question": {
      const question = typeof body.question === "string" ? body.question.trim() : "";
      if (!question) {
        return NextResponse.json({ error: "질문이 비어있어요" }, { status: 400 });
      }
      // 현재 턴인 사람만 추가 가능
      const currentPlayer = room.players[room.turnIndex % room.players.length];
      if (!currentPlayer || currentPlayer.id !== userId) {
        return NextResponse.json({ error: "지금은 당신의 차례가 아니에요" }, { status: 409 });
      }
      // 중복 검사
      if (room.chain.some((c) => c.question.trim() === question)) {
        return NextResponse.json({ error: "이미 나온 질문이에요" }, { status: 400 });
      }
      const item: RoomChainItem = { question, playerId: userId, playerName: userName };
      room.chain.push(item);
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      await saveRoom(room);
      break;
    }

    case "end": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 종료할 수 있어요" }, { status: 403 });
      }
      room.status = "ended";
      await saveRoom(room);
      break;
    }

    case "restart": {
      if (room.hostId !== userId) {
        return NextResponse.json({ error: "방장만 다시 시작할 수 있어요" }, { status: 403 });
      }
      room.status = "waiting";
      room.chain = [];
      room.turnIndex = 0;
      room.topic = "";
      room.gameState = {};
      await saveRoom(room);
      break;
    }

    default:
      return NextResponse.json({ error: `알 수 없는 액션: ${action}` }, { status: 400 });
  }

  return NextResponse.json({ room });
}
