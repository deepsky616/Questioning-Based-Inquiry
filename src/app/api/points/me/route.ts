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
      where: { studentId: userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    totalPoints: user?.totalPoints ?? 0,
    recent: recentLogs,
  });
}
