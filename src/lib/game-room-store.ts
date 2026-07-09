import { prisma } from "@/lib/db";
import type { GameRoom, RoomPlayer } from "@/lib/question-games-data";

function gen4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function isStaleRoomAction(room: GameRoom, expectedVersion: unknown) {
  return typeof expectedVersion === "number" && expectedVersion !== room.version;
}

export async function loadGameRoom(code: string): Promise<GameRoom | null> {
  const rec = await prisma.gameRoom.findUnique({ where: { code } });
  if (!rec) return null;
  try {
    const room = rec.data as unknown as GameRoom;
    return { ...room, version: room.version ?? 1 };
  } catch {
    return null;
  }
}

export async function saveGameRoom(room: GameRoom) {
  room.version = (room.version ?? 1) + 1;
  room.updatedAt = Date.now();
  await prisma.gameRoom.update({
    where: { code: room.code },
    data: { data: room as unknown as object },
  });
}

export async function deleteGameRoom(code: string) {
  await prisma.gameRoom.delete({ where: { code } }).catch(() => {});
}

export async function createGameRoom({
  gameId,
  hostId,
  hostName,
}: {
  gameId: string;
  hostId: string;
  hostName: string;
}): Promise<GameRoom | null> {
  let code = "";
  for (let i = 0; i < 12; i++) {
    const candidate = gen4();
    const existing = await prisma.gameRoom.findUnique({ where: { code: candidate } });
    if (!existing) {
      code = candidate;
      break;
    }
  }
  if (!code) return null;

  const now = Date.now();
  const host: RoomPlayer = { id: hostId, name: hostName, isHost: true, joinedAt: now };
  const room: GameRoom = {
    code,
    gameId,
    hostId,
    status: "waiting",
    players: [host],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await prisma.gameRoom.create({
    data: {
      code,
      data: room as unknown as object,
    },
  });

  return room;
}
