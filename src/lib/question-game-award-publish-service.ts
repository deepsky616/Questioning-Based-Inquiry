import { prisma } from "@/lib/db";
import {
  restorePublishableAwardResult,
  type GameAwardResult,
} from "@/lib/game-award-result";
import { buildRoomAwardKey } from "@/lib/point-award-service";

export interface VerifiedGameAwardIdentity {
  gameId: string;
  roomCode: string;
  roomCreatedAt: number;
  playId: string;
}

export async function loadVerifiedGameAwardResult(
  identity: VerifiedGameAwardIdentity,
): Promise<GameAwardResult | null> {
  const logs = await prisma.pointLog.findMany({
    where: {
      gameId: identity.gameId,
      roomCode: buildRoomAwardKey(
        identity.roomCode,
        identity.roomCreatedAt,
        identity.playId,
      ),
      status: "APPROVED",
    },
    orderBy: { createdAt: "asc" },
    select: {
      studentId: true,
      bonusType: true,
      points: true,
      reason: true,
      status: true,
      aiAnalysis: true,
    },
  });
  return restorePublishableAwardResult(
    logs.filter((log) => log.status === "APPROVED"),
  );
}
