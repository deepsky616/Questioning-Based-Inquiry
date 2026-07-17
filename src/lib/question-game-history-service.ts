import { prisma } from "@/lib/db";
import { BUILT_IN_QUESTION_GAME_IDS } from "@/lib/question-game-rules";
import {
  buildQuestionGameLearningHistory,
  type QuestionGameLearningHistory,
} from "@/lib/question-game-history";

export async function loadQuestionGameLearningHistory(
  studentId: string,
): Promise<QuestionGameLearningHistory> {
  const [runs, friendLogs] = await Promise.all([
    prisma.gameRun.findMany({
      where: {
        ownerId: studentId,
        status: "SETTLED",
        mode: { in: ["SOLO", "AI"] },
        gameId: { in: [...BUILT_IN_QUESTION_GAME_IDS] },
      },
      orderBy: { settledAt: "desc" },
      select: {
        id: true,
        gameId: true,
        mode: true,
        settledAt: true,
        activities: {
          select: { actorId: true, validQuestionCount: true },
        },
        pointLogs: {
          where: { status: "APPROVED" },
          select: { studentId: true, points: true },
        },
      },
    }),
    prisma.pointLog.findMany({
      where: {
        studentId,
        status: "APPROVED",
        gameId: { in: [...BUILT_IN_QUESTION_GAME_IDS] },
        roomCode: { startsWith: "room:" },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        gameId: true,
        roomCode: true,
        bonusType: true,
        points: true,
        reason: true,
        createdAt: true,
      },
    }),
  ]);

  return buildQuestionGameLearningHistory({ studentId, runs, friendLogs });
}
