import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import {
  SOLO_POINTS, AI_POINTS, DAILY_LIMITS, GAME_LABEL,
} from "@/lib/points-policy";

interface SingleAwardBody {
  mode: "solo" | "ai";
  gameId: string;
  instanceId: string;       // 게임 인스턴스 ID (멱등 키)
  validQuestions: number;   // 유효 활동 수
  completed: boolean;
}

// 싱글 게임(혼자/AI) 종료 시 1회 호출
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  // 학생만 포인트 적립. 교사 미리보기/체험은 적립·기록 없이 통과시킨다.
  if ((session.user as { role?: string }).role !== "STUDENT") {
    return NextResponse.json({ awarded: 0, preview: true });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<SingleAwardBody>;
  const mode = body.mode === "solo" || body.mode === "ai" ? body.mode : null;
  const gameId = typeof body.gameId === "string" ? body.gameId : "";
  const instanceId = typeof body.instanceId === "string" ? body.instanceId : "";
  const validQuestions = Math.max(0, Math.floor(Number(body.validQuestions) || 0));
  const completed = !!body.completed;

  if (!mode || !gameId || !instanceId) {
    return NextResponse.json({ error: "mode, gameId, instanceId 필요" }, { status: 400 });
  }

  // 끝까지 마무리한 경우에만 적립
  if (!completed) {
    return NextResponse.json({
      awarded: 0,
      notCompleted: true,
      message: "놀이를 끝까지 마무리해야 포인트가 지급돼요.",
    });
  }

  // 정책별 점수 계산
  const policy = mode === "solo" ? SOLO_POINTS : AI_POINTS;
  const dailyLimit = mode === "solo" ? DAILY_LIMITS.SOLO : DAILY_LIMITS.AI;
  const modeKey = mode === "solo" ? "ACTIVITY_SOLO" : "ACTIVITY_AI";

  let computed = policy.PARTICIPATION;
  computed += validQuestions * policy.PER_VALID_QUESTION;
  computed += policy.COMPLETION;
  if (computed <= 0) {
    return NextResponse.json({ awarded: 0, reason: "활동 점수 없음" });
  }

  // 멱등: 같은 instanceId + bonusType 조합은 중복 차단
  const bonusType = `${modeKey}_${gameId}`;
  const existing = await prisma.pointLog.findFirst({
    where: { studentId: userId, reason: `instance:${instanceId}` },
    select: { id: true, points: true },
  });
  if (existing) {
    return NextResponse.json({ alreadyAwarded: true, awarded: existing.points });
  }

  // 일일 상한 검증: 오늘 00:00부터 같은 modeKey 합산
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayAgg = await prisma.pointLog.aggregate({
    where: {
      studentId: userId,
      gameId: modeKey,
      status: "APPROVED",
      createdAt: { gte: todayStart },
    },
    _sum: { points: true },
  });
  const todaySum = todayAgg._sum.points ?? 0;
  const remaining = Math.max(0, dailyLimit - todaySum);
  const finalAward = Math.min(computed, remaining);
  const cappedByLimit = finalAward < computed;

  if (finalAward <= 0) {
    return NextResponse.json({
      awarded: 0,
      dailyLimitReached: true,
      message: `오늘 ${mode === "solo" ? "혼자" : "AI"} 모드 일일 상한(${dailyLimit}점)에 도달했어요.`,
    });
  }

  try {
    await prisma.$transaction([
      prisma.pointLog.create({
        data: {
          studentId: userId,
          gameId: modeKey,             // 일일 상한 합산 키
          bonusType,
          points: finalAward,
          reason: `instance:${instanceId}`,
          status: "APPROVED",
        } as Prisma.PointLogUncheckedCreateInput,
      }),
      prisma.user.update({
        where: { id: userId },
        data: { totalPoints: { increment: finalAward } },
      }),
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ alreadyAwarded: true, awarded: 0 });
    }
    return NextResponse.json({ error: "지급 실패" }, { status: 500 });
  }

  return NextResponse.json({
    awarded: finalAward,
    cappedByLimit,
    dailyRemaining: Math.max(0, remaining - finalAward),
    gameLabel: GAME_LABEL[gameId] ?? gameId,
  });
}
