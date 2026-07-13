import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MAX_ACTIVITY_BONUS_PER_STUDENT, TEACHER_ADJUSTED_BONUS } from "@/lib/activity-bonus-policy";
import {
  isStudentInTeacherScope,
  loadTeacherStudentScope,
} from "@/lib/teacher-student-access";

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
    include: {
      student: {
        select: {
          id: true,
          role: true,
          school: true,
          grade: true,
          className: true,
        },
      },
    },
  });

  const teacherScope = await loadTeacherStudentScope(teacherId);
  const sessionIds = Array.from(new Set(myLogs.map((l) => l.sessionId).filter((x): x is string => !!x)));
  const ownedSessions = await prisma.questionSession.findMany({
    where: { id: { in: sessionIds }, teacherId },
    select: { id: true },
  });
  const ownedSet = new Set(ownedSessions.map((s) => s.id));

  const allowed = teacherScope
    ? myLogs.filter(
        (log) =>
          isStudentInTeacherScope(teacherScope, log.student) &&
          (!log.sessionId || ownedSet.has(log.sessionId)),
      )
    : [];
  if (allowed.length === 0) {
    return NextResponse.json({ error: "권한 있는 보너스가 없습니다" }, { status: 403 });
  }

  const now = new Date();
  let changedCount = 0;

  if (decision === "APPROVE") {
    changedCount = await prisma.$transaction(async (tx) => {
      const sumByStudent: Record<string, number> = {};
      let claimedCount = 0;

      for (const log of allowed) {
        const claimed = await tx.pointLog.updateMany({
          where: { id: log.id, status: "PENDING" },
          data: {
            status: "APPROVED",
            decidedById: teacherId,
            decidedAt: now,
            ...(overridePoints != null ? { points: overridePoints } : {}),
            ...(overridePoints != null && log.bonusType.includes("FLAGGED")
              ? { bonusType: TEACHER_ADJUSTED_BONUS }
              : {}),
          },
        });
        if (claimed.count === 0) continue;

        const points = overridePoints != null ? overridePoints : log.points;
        sumByStudent[log.studentId] = (sumByStudent[log.studentId] ?? 0) + points;
        claimedCount += claimed.count;
      }

      for (const [studentId, points] of Object.entries(sumByStudent)) {
        await tx.user.update({
          where: { id: studentId },
          data: { totalPoints: { increment: points } },
        });
      }

      return claimedCount;
    });
  } else {
    // REJECT: 상태만 변경 (totalPoints 미반영)
    const rejected = await prisma.pointLog.updateMany({
      where: { id: { in: allowed.map((l) => l.id) }, status: "PENDING" },
      data: {
        status: "REJECTED",
        decidedById: teacherId,
        decidedAt: now,
      },
    });
    changedCount = rejected.count;
  }

  return NextResponse.json({ ok: true, count: changedCount });
}
