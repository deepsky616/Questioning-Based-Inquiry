import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 교사 담당 세션의 미검토(PENDING) AI 추천 포인트 개수
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const sessions = await prisma.questionSession.findMany({
    where: { teacherId },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) return NextResponse.json({ count: 0 });

  const count = await prisma.pointLog.count({
    where: { status: "PENDING", sessionId: { in: sessionIds } },
  });
  return NextResponse.json({ count });
}
