import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// 교사가 검토할 PENDING 보너스 목록 (세션별)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? undefined;

  // 교사 담당 세션만
  const sessions = await prisma.questionSession.findMany({
    where: { teacherId, ...(sessionId ? { id: sessionId } : {}) },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  const logs = await prisma.pointLog.findMany({
    where: {
      status: "PENDING",
      ...(sessionId
        ? { sessionId }
        : { sessionId: { in: sessionIds } }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      student: { select: { id: true, name: true, grade: true, className: true } },
    },
  });

  // 관련 질문·댓글 본문 동시 조회 (검토용)
  const qIds = Array.from(new Set(logs.map((l) => l.relatedQuestionId).filter((x): x is string => !!x)));
  const cIds = Array.from(new Set(logs.map((l) => l.relatedCommentId).filter((x): x is string => !!x)));
  const [qMap, cMap] = await Promise.all([
    prisma.question.findMany({ where: { id: { in: qIds } }, select: { id: true, content: true } }),
    prisma.comment.findMany({ where: { id: { in: cIds } }, select: { id: true, content: true } }),
  ]);
  const qBy = new Map(qMap.map((q) => [q.id, q.content]));
  const cBy = new Map(cMap.map((c) => [c.id, c.content]));

  return NextResponse.json({
    pending: logs.map((l) => ({
      id: l.id,
      studentId: l.studentId,
      studentName: l.student.name,
      grade: l.student.grade,
      className: l.student.className,
      bonusType: l.bonusType,
      points: l.points,
      reason: l.reason,
      sessionId: l.sessionId,
      relatedQuestionId: l.relatedQuestionId,
      relatedCommentId: l.relatedCommentId,
      questionContent: l.relatedQuestionId ? qBy.get(l.relatedQuestionId) ?? "" : "",
      commentContent: l.relatedCommentId ? cBy.get(l.relatedCommentId) ?? "" : "",
      aiAnalysis: l.aiAnalysis,
      createdAt: l.createdAt,
    })),
  });
}
