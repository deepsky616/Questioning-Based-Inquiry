import { prisma } from "@/lib/db";
import {
  createNoEligibleStudentAwardResult,
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

export class QuestionGameAwardPublishError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "QuestionGameAwardPublishError";
  }
}

export async function loadVerifiedGameAwardResult(
  identity: VerifiedGameAwardIdentity,
  allowedStudentIds: ReadonlySet<string>,
): Promise<GameAwardResult | null> {
  const awardKey = buildRoomAwardKey(
    identity.roomCode,
    identity.roomCreatedAt,
    identity.playId,
  );
  const settlement = await prisma.gameRoomSettlement.findUnique({
    where: {
      gameId_awardKey: {
        gameId: identity.gameId,
        awardKey,
      },
    },
    select: { outcome: true },
  });
  if (settlement?.outcome === "NO_ELIGIBLE_STUDENTS") {
    return createNoEligibleStudentAwardResult();
  }
  if (settlement?.outcome !== "AWARDED") return null;

  const logs = await prisma.pointLog.findMany({
    where: {
      gameId: identity.gameId,
      roomCode: awardKey,
      status: "APPROVED",
    },
    orderBy: [
      { createdAt: "asc" },
      { studentId: "asc" },
      { bonusType: "asc" },
    ],
    select: {
      studentId: true,
      bonusType: true,
      points: true,
      reason: true,
      status: true,
      aiAnalysis: true,
    },
  });
  const approvedLogs = logs.filter((log) => log.status === "APPROVED");
  if (approvedLogs.some((log) => !allowedStudentIds.has(log.studentId))) {
    throw new QuestionGameAwardPublishError(
      "현재 방 참가 학생의 점수만 공개할 수 있습니다",
      403,
    );
  }
  return restorePublishableAwardResult(approvedLogs);
}
