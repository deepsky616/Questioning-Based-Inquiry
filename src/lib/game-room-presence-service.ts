import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  deleteGameRoomPresence,
  findStaleGameRoomParticipant,
  initializeAndTouchGameRoomPresence,
  isGameRoomPresenceStale,
} from "@/lib/game-room-presence-store";
import {
  loadLockedGameRoom,
  saveGameRoom,
} from "@/lib/game-room-store";
import { leaveQuestionGameRoom } from "@/lib/question-game-room-engine";
import type { GameRoom } from "@/lib/question-games-data";

const PRESENCE_STALE_MS = 120_000;
const PRESENCE_WRITE_ATTEMPTS = 8;

export type GameRoomPresenceUpdateResult =
  | { kind: "room"; room: GameRoom }
  | { kind: "conflict"; room: GameRoom }
  | { kind: "removed" }
  | { kind: "forbidden" }
  | { kind: "missing" };

class RetryPresenceTransaction extends Error {
  constructor() {
    super("retry presence transaction");
  }
}

function isRoomMember(room: GameRoom, userId: string) {
  return room.players.some((player) => player.id === userId);
}

function leaveWaitingRoom(room: GameRoom, userId: string) {
  if (!isRoomMember(room, userId)) {
    return { kind: "replayed" as const, room };
  }

  const remainingPlayers = room.players.filter((player) => player.id !== userId);
  const nextHostId = remainingPlayers.some((player) => player.id === room.hostId)
    ? room.hostId
    : (remainingPlayers[0]?.id ?? "");
  return {
    kind: "changed" as const,
    room: {
      ...room,
      hostId: nextHostId,
      players: remainingPlayers.map((player) => ({
        ...player,
        isHost: player.id === nextHostId,
      })),
    },
  };
}

function isRetryableTransactionError(error: unknown) {
  return error instanceof RetryPresenceTransaction ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
}

export async function updateGameRoomPresence({
  code,
  userId,
  expectedCreatedAt,
  random = Math.random,
  randomUUID = () => globalThis.crypto.randomUUID(),
}: {
  code: string;
  userId: string;
  expectedCreatedAt: number;
  random?: () => number;
  randomUUID?: () => string;
}): Promise<GameRoomPresenceUpdateResult> {
  for (let attempt = 0; attempt < PRESENCE_WRITE_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const room = await loadLockedGameRoom(code, tx);
        if (!room) return { kind: "missing" } as const;

        // 권한 확인은 방 수명 충돌보다 먼저 수행해 비참가자에게 방을 노출하지 않는다.
        if (!isRoomMember(room, userId)) {
          return room.blockedPlayerIds?.includes(userId)
            ? { kind: "removed" } as const
            : { kind: "forbidden" } as const;
        }
        if (room.createdAt !== expectedCreatedAt) {
          return { kind: "conflict", room } as const;
        }

        const now = new Date(Date.now());
        await initializeAndTouchGameRoomPresence({ room, userId, now }, tx);
        if (room.status !== "waiting" && room.gameState.stateVersion !== 2) {
          return { kind: "room", room } as const;
        }

        const staleBefore = new Date(now.getTime() - PRESENCE_STALE_MS);
        const staleUserId = await findStaleGameRoomParticipant(
          { room, staleBefore },
          tx,
        );
        if (!staleUserId) return { kind: "room", room } as const;

        const result = room.status === "waiting"
          ? leaveWaitingRoom(room, staleUserId)
          : leaveQuestionGameRoom({
              room,
              userId: staleUserId,
              now: now.getTime(),
              random,
              randomUUID,
            });
        if (result.kind === "replayed") {
          return { kind: "room", room: result.room } as const;
        }
        if (result.kind !== "changed") {
          throw new Error("질문놀이 접속 정리를 처리할 수 없습니다");
        }

        const stillStale = await isGameRoomPresenceStale(
          { room, userId: staleUserId, staleBefore },
          tx,
        );
        if (!stillStale) return { kind: "room", room } as const;

        const saved = await saveGameRoom(result.room, tx);
        if (saved.kind === "saved") {
          await deleteGameRoomPresence({
            roomCode: room.code,
            roomCreatedAt: room.createdAt,
            userId: staleUserId,
          }, tx);
          return { kind: "room", room: saved.room } as const;
        }
        if (saved.kind === "missing") return { kind: "missing" } as const;

        // 예상 밖의 낙관적 충돌에서도 최신 참가 권한을 다시 확인한다.
        if (!isRoomMember(saved.room, userId)) {
          return { kind: "forbidden" } as const;
        }
        if (attempt === PRESENCE_WRITE_ATTEMPTS - 1) {
          return { kind: "conflict", room: saved.room } as const;
        }
        throw new RetryPresenceTransaction();
      });
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < PRESENCE_WRITE_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("질문놀이 접속 확인을 마치지 못했습니다");
}
