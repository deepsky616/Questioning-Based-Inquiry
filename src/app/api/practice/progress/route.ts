import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildPracticeDiagnostic } from "@/lib/practice-diagnostics";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  if (session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "학생만 접근할 수 있습니다" }, { status: 403 });
  }

  const attempts = await prisma.practiceAttempt.findMany({
    where: {
      studentId: session.user.id,
      createdAt: { gte: new Date(Date.now() - THIRTY_DAYS_MS) },
    },
    orderBy: { createdAt: "desc" },
    take: 101,
  });
  const diagnostic = buildPracticeDiagnostic(attempts.slice(0, 100));

  return NextResponse.json({
    ...diagnostic,
    capped: attempts.length > 100,
  });
}
