import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ensureQuestionGameRoomPoints } from "@/lib/point-award-service";
import {
  buildRoomAwardKey,
  isCompletedVersion2QuestionGameRoom,
} from "@/lib/question-game-room-award-ledger";
import { parseGameRoom, type GameRoom } from "@/lib/question-games-data";
import type {
  QuestionGameSettlementHealth,
  QuestionGameSettlementItem,
} from "@/lib/question-game-settlement-health";

type SettlementOutcome = "AWARDED" | "NO_ELIGIBLE_STUDENTS";

function settlementOutcome(value: unknown): SettlementOutcome | null {
  return value === "AWARDED" || value === "NO_ELIGIBLE_STUDENTS"
    ? value
    : null;
}

async function loadSettlementOutcome(room: GameRoom) {
  if (!room.playId) return null;
  const settlement = await prisma.gameRoomSettlement.findUnique({
    where: {
      gameId_awardKey: {
        gameId: room.gameId,
        awardKey: buildRoomAwardKey(room.code, room.createdAt, room.playId),
      },
    },
    select: { outcome: true },
  });
  return settlementOutcome(settlement?.outcome);
}

function repairFailureReason(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 200);
  }
  return "포인트 지급을 완료하지 못했습니다.";
}

export async function inspectQuestionGameSettlements({
  teacherId,
  repair = false,
  take = 50,
  now = new Date(),
}: {
  teacherId?: string;
  repair?: boolean;
  take?: number;
  now?: Date;
} = {}): Promise<QuestionGameSettlementHealth> {
  const limit = Math.min(100, Math.max(1, Math.trunc(take)));
  const endedFilter = { data: { path: ["status"], equals: "ended" } };
  const records = await prisma.gameRoom.findMany({
    where: teacherId
      ? {
          AND: [
            endedFilter,
            { data: { path: ["hostId"], equals: teacherId } },
          ],
        }
      : { AND: [endedFilter] },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { code: true, data: true, updatedAt: true },
  });

  const items: QuestionGameSettlementItem[] = [];
  for (const record of records) {
    const room = parseGameRoom(record.data);
    if (
      !room ||
      room.code !== record.code ||
      !isCompletedVersion2QuestionGameRoom(room) ||
      room.pointAwardKeyVersion !== 2 ||
      room.pointEvidenceVersion !== 2 ||
      !room.playId
    ) {
      continue;
    }

    const base = {
      code: room.code,
      gameId: room.gameId,
      completedAt: new Date(
        room.pointCompletedAt ?? room.updatedAt ?? record.updatedAt,
      ).toISOString(),
    };
    const existing = await loadSettlementOutcome(room);
    if (existing) {
      items.push({ ...base, status: "settled", outcome: existing });
      continue;
    }
    if (!repair) {
      items.push({
        ...base,
        status: "pending",
        reason: "포인트 지급 장부를 찾을 수 없습니다.",
      });
      continue;
    }

    try {
      await ensureQuestionGameRoomPoints(room);
      const recovered = await loadSettlementOutcome(room);
      if (recovered) {
        items.push({ ...base, status: "recovered", outcome: recovered });
      } else {
        items.push({
          ...base,
          status: "failed",
          reason: "포인트 지급 뒤 장부 기록을 확인할 수 없습니다.",
        });
      }
    } catch (error) {
      const reason = repairFailureReason(error);
      items.push({ ...base, status: "failed", reason });
      logger.warn("질문놀이 포인트 지급 복구 실패", {
        roomCode: room.code,
        gameId: room.gameId,
        reason,
      });
    }
  }

  return {
    checkedAt: now.toISOString(),
    summary: {
      checked: items.length,
      settled: items.filter(({ status }) => status === "settled").length,
      recovered: items.filter(({ status }) => status === "recovered").length,
      pending: items.filter(({ status }) => status === "pending").length,
      failed: items.filter(({ status }) => status === "failed").length,
    },
    items,
  };
}
