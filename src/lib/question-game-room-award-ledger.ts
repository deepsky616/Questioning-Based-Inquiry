import type { Prisma } from "@prisma/client";
import type { GameRoom } from "@/lib/question-games-data";

export function buildRoomAwardKey(
  roomCode: string,
  roomCreatedAt: number,
  playId?: string,
) {
  return playId
    ? `room:${roomCode}:${roomCreatedAt}:${playId}`
    : `room:${roomCode}:${roomCreatedAt}`;
}

export function isCompletedVersion2QuestionGameRoom(room: GameRoom) {
  return room.status === "ended" &&
    room.gameState.stateVersion === 2 &&
    room.gameState.phase === "done" &&
    room.gameState.endReason === "completed";
}

export function isVersion2QuestionGameRoomCandidate(room: GameRoom) {
  return room.gameState.stateVersion === 2 ||
    room.pointEvidenceVersion === 2 ||
    room.pointAwardKeyVersion === 2;
}

export function isCompletedVersion2QuestionGameRoomCandidate(room: GameRoom) {
  return isVersion2QuestionGameRoomCandidate(room) &&
    room.status === "ended" &&
    room.gameState.phase === "done" &&
    room.gameState.endReason === "completed";
}

export async function hasSettledQuestionGameRoomAward(
  client: Pick<Prisma.TransactionClient, "gameRoomSettlement">,
  room: GameRoom,
): Promise<boolean> {
  if (
    !isCompletedVersion2QuestionGameRoom(room) ||
    room.pointAwardKeyVersion !== 2 ||
    room.pointEvidenceVersion !== 2 ||
    typeof room.playId !== "string" ||
    room.playId.length === 0
  ) {
    return false;
  }

  const settlement = await client.gameRoomSettlement.findUnique({
    where: {
      gameId_awardKey: {
        gameId: room.gameId,
        awardKey: buildRoomAwardKey(room.code, room.createdAt, room.playId),
      },
    },
    select: { outcome: true },
  });
  return settlement?.outcome === "AWARDED" ||
    settlement?.outcome === "NO_ELIGIBLE_STUDENTS";
}
