import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const [user, recentLogs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { totalPoints: true },
    }),
    prisma.pointLog.findMany({
      // 학생에게는 확정된 지급 내역만 — 대기(PENDING)·거부(REJECTED) 항목과
      // 0점 경고(중복·불성실 FLAGGED)는 교사 검토용이라 노출하지 않는다(낙인 방지)
      where: {
        studentId: userId,
        status: "APPROVED",
        NOT: { bonusType: { contains: "FLAGGED" } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    totalPoints: user?.totalPoints ?? 0,
    recent: recentLogs,
  });
}
