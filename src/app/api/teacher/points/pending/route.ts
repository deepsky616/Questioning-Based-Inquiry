import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  loadTeacherStudentScope,
  studentWhereForTeacherScope,
} from "@/lib/teacher-student-access";

// 교사가 검토할 PENDING 보너스 목록 (세션별)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? undefined;
  const teacherScope = await loadTeacherStudentScope(teacherId);
  if (!teacherScope) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  // 교사 담당 세션만
  const sessions = await prisma.questionSession.findMany({
    where: { teacherId, ...(sessionId ? { id: sessionId } : {}) },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  const logs = await prisma.pointLog.findMany({
    where: {
      status: "PENDING",
      sessionId: { in: sessionIds },
      student: studentWhereForTeacherScope(teacherScope),
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
    prisma.question.findMany({
      where: { id: { in: qIds } },
      select: { id: true, content: true, _count: { select: { likes: true } } },
    }),
    prisma.comment.findMany({ where: { id: { in: cIds } }, select: { id: true, content: true } }),
  ]);
  const qBy = new Map(qMap.map((q) => [q.id, { content: q.content, likeCount: q._count.likes }]));
  const cBy = new Map(cMap.map((c) => [c.id, c.content]));

  // 이미 승인된 포인트(중복 지급 방지용 안내): 같은 학생의 APPROVED 내역을
  // 같은 작성물(질문/댓글) 또는 같은 수업세션 기준으로 합산해 보여준다.
  const studentIds = Array.from(new Set(logs.map((l) => l.studentId)));
  const pendingSessionIds = Array.from(new Set(logs.map((l) => l.sessionId).filter((x): x is string => !!x)));
  const approved = studentIds.length > 0
    ? await prisma.pointLog.findMany({
        where: {
          status: "APPROVED",
          studentId: { in: studentIds },
          OR: [
            ...(pendingSessionIds.length ? [{ sessionId: { in: pendingSessionIds } }] : []),
            { relatedQuestionId: { in: qIds.length ? qIds : ["__none__"] } },
            { relatedCommentId: { in: cIds.length ? cIds : ["__none__"] } },
          ],
        },
        select: { studentId: true, sessionId: true, points: true, relatedQuestionId: true, relatedCommentId: true },
      })
    : [];

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
      questionContent: l.relatedQuestionId ? qBy.get(l.relatedQuestionId)?.content ?? "" : "",
      questionLikeCount: l.relatedQuestionId ? qBy.get(l.relatedQuestionId)?.likeCount ?? 0 : null,
      commentContent: l.relatedCommentId ? cBy.get(l.relatedCommentId) ?? "" : "",
      aiAnalysis: l.aiAnalysis,
      createdAt: l.createdAt,
      // 이미 승인된 포인트: 같은 작성물 / 같은 수업세션 기준 합산
      alreadyForTarget: approved
        .filter((a) =>
          a.studentId === l.studentId &&
          ((l.relatedQuestionId && a.relatedQuestionId === l.relatedQuestionId) ||
            (l.relatedCommentId && a.relatedCommentId === l.relatedCommentId)))
        .reduce((sum, a) => sum + a.points, 0),
      alreadyInSession: approved
        .filter((a) => a.studentId === l.studentId && l.sessionId && a.sessionId === l.sessionId)
        .reduce((sum, a) => sum + a.points, 0),
    })),
  });
}
