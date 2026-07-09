import { prisma } from "@/lib/db";
import type { GameRoom, RoomPlayer } from "@/lib/question-games-data";

const ROOM_KEY_PREFIX = "game_room_";

function roomKey(code: string) {
  return `${ROOM_KEY_PREFIX}${code}`;
}

function gen4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function isStaleRoomAction(room: GameRoom, expectedVersion: unknown) {
  return typeof expectedVersion === "number" && expectedVersion !== room.version;
}

export async function loadGameRoom(code: string): Promise<GameRoom | null> {
  const rec = await prisma.systemConfig.findUnique({ where: { key: roomKey(code) } });
  if (!rec) return null;
  try {
    const room = JSON.parse(rec.value) as GameRoom;
    return { ...room, version: room.version ?? 1 };
  } catch {
    return null;
  }
}

export async function saveGameRoom(room: GameRoom) {
  room.version = (room.version ?? 1) + 1;
  room.updatedAt = Date.now();
  await prisma.systemConfig.update({
    where: { key: roomKey(room.code) },
    data: { value: JSON.stringify(room) },
  });
}

export async function deleteGameRoom(code: string) {
  await prisma.systemConfig.delete({ where: { key: roomKey(code) } }).catch(() => {});
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
    const existing = await prisma.systemConfig.findUnique({ where: { key: roomKey(candidate) } });
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

  await prisma.systemConfig.upsert({
    where: { key: roomKey(code) },
    update: { value: JSON.stringify(room) },
    create: { key: roomKey(code), value: JSON.stringify(room) },
  });

  return room;
}
