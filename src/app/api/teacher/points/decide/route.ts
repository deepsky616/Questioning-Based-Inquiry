import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MAX_ACTIVITY_BONUS_PER_STUDENT } from "@/lib/activity-bonus-policy";

// PENDING 보너스 일괄 승인/거부/수정
// body: { ids: string[], decision: 'APPROVE' | 'REJECT', overridePoints?: number }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const decision = body.decision === "APPROVE" || body.decision === "REJECT" ? body.decision : null;
  const overridePoints = typeof body.overridePoints === "number" ? body.overridePoints : null;
  if (ids.length === 0 || !decision) {
    return NextResponse.json({ error: "ids와 decision 필요" }, { status: 400 });
  }
  // 수정 점수 범위 검증 — 음수(감점)와 상한 초과를 서버에서 차단한다
  if (
    overridePoints != null &&
    (!Number.isInteger(overridePoints) || overridePoints < 0 || overridePoints > MAX_ACTIVITY_BONUS_PER_STUDENT)
  ) {
    return NextResponse.json(
      { error: `수정 점수는 0~${MAX_ACTIVITY_BONUS_PER_STUDENT} 사이의 정수여야 합니다` },
      { status: 400 },
    );
  }

  // 교사 권한 검증: 자기 담당 세션의 보너스만
  const myLogs = await prisma.pointLog.findMany({
    where: { id: { in: ids }, status: "PENDING" },
    include: { student: { select: { id: true } } },
  });

  const sessionIds = Array.from(new Set(myLogs.map((l) => l.sessionId).filter((x): x is string => !!x)));
  const ownedSessions = await prisma.questionSession.findMany({
    where: { id: { in: sessionIds }, teacherId },
    select: { id: true },
  });
  const ownedSet = new Set(ownedSessions.map((s) => s.id));

  const allowed = myLogs.filter((l) => !l.sessionId || ownedSet.has(l.sessionId));
  if (allowed.length === 0) {
    return NextResponse.json({ error: "권한 있는 보너스가 없습니다" }, { status: 403 });
  }

  const now = new Date();

  if (decision === "APPROVE") {
    // 점수별 합산해서 학생 totalPoints에 increment
    const sumByStudent: Record<string, number> = {};
    for (const l of allowed) {
      const pts = overridePoints != null ? overridePoints : l.points;
      sumByStudent[l.studentId] = (sumByStudent[l.studentId] ?? 0) + pts;
    }

    await prisma.$transaction([
      // 상태 변경 (overridePoints가 있으면 점수도 수정)
      ...allowed.map((l) =>
        prisma.pointLog.update({
          where: { id: l.id },
          data: {
            status: "APPROVED",
            decidedById: teacherId,
            decidedAt: now,
            ...(overridePoints != null ? { points: overridePoints } : {}),
          },
        })
      ),
      // 학생 totalPoints 증가
      ...Object.entries(sumByStudent).map(([sid, pts]) =>
        prisma.user.update({
          where: { id: sid },
          data: { totalPoints: { increment: pts } },
        })
      ),
    ]);
  } else {
    // REJECT: 상태만 변경 (totalPoints 미반영)
    await prisma.pointLog.updateMany({
      where: { id: { in: allowed.map((l) => l.id) } },
      data: {
        status: "REJECTED",
        decidedById: teacherId,
        decidedAt: now,
      },
    });
  }

  return NextResponse.json({ ok: true, count: allowed.length });
}
