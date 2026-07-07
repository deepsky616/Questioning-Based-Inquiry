import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildActivityReport } from "@/lib/report-stats";
import { summarizeStudentSessionActivity } from "@/lib/report-session-activity";

// 학생 활동 리포트: 본인(학생) 또는 교사가 지정한 학생의 질문·좋아요·댓글(쓴 것+받은 것) 추세
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id: string }).id;

  const requestedId = req.nextUrl.searchParams.get("studentId");
  const targetId = role === "TEACHER" && requestedId ? requestedId : userId;

  const student = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, role: true, grade: true, className: true, studentNumber: true, school: true },
  });
  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다" }, { status: 404 });
  }

  const [questions, likesGiven, comments, likesReceived, commentsReceived, sessions] = await Promise.all([
    prisma.question.findMany({ where: { authorId: targetId }, select: { createdAt: true, closure: true, cognitive: true } }),
    prisma.questionLike.findMany({ where: { userId: targetId }, select: { createdAt: true } }),
    prisma.comment.findMany({ where: { authorId: targetId }, select: { createdAt: true } }),
    prisma.questionLike.findMany({ where: { question: { authorId: targetId } }, select: { createdAt: true } }),
    prisma.comment.findMany({ where: { question: { authorId: targetId } }, select: { createdAt: true } }),
    // 학생이 참여한(질문·댓글·좋아요) 수업 세션
    prisma.questionSession.findMany({
      where: {
        OR: [
          { questions: { some: { authorId: targetId } } },
          { questions: { some: { comments: { some: { authorId: targetId } } } } },
          { questions: { some: { likes: { some: { userId: targetId } } } } },
        ],
      },
      select: { id: true, date: true, subject: true, topic: true },
      orderBy: { date: "desc" },
    }),
  ]);

  const report = buildActivityReport({ questions, likesGiven, comments, likesReceived, commentsReceived });

  // 저장된 세션 AI 분석(이 학생 관점)을 동봉 → 어느 브라우저·기기에서도 마지막 분석 표시
  const analyses = await prisma.sessionAnalysis.findMany({
    where: { sessionId: { in: sessions.map((s) => s.id) }, scope: "student", studentId: targetId },
    select: { sessionId: true, result: true },
  });
  const analysisBySession = new Map(analyses.map((a) => [a.sessionId, a.result]));
  const sessionIds = sessions.map((s) => s.id);
  const [sessionQuestions, sessionComments, sessionLikes] = sessionIds.length > 0
    ? await Promise.all([
        prisma.question.findMany({
          where: { sessionId: { in: sessionIds }, authorId: targetId },
          select: { sessionId: true },
        }),
        prisma.comment.findMany({
          where: { authorId: targetId, question: { sessionId: { in: sessionIds } } },
          select: { question: { select: { sessionId: true } } },
        }),
        prisma.questionLike.findMany({
          where: { userId: targetId, question: { sessionId: { in: sessionIds } } },
          select: { question: { select: { sessionId: true } } },
        }),
      ])
    : [[], [], []] as const;
  const activityBySession = summarizeStudentSessionActivity({
    questions: sessionQuestions,
    comments: sessionComments.map((c) => ({ sessionId: c.question.sessionId })),
    likes: sessionLikes.map((l) => ({ sessionId: l.question.sessionId })),
  });
  const sessionsWithAnalysis = sessions.map((s) => ({
    ...s,
    ...(activityBySession.get(s.id) ?? {}),
    analysis: analysisBySession.get(s.id) ?? null,
  }));

  return NextResponse.json({
    scope: "student",
    student: {
      id: student.id, name: student.name, grade: student.grade,
      className: student.className, studentNumber: student.studentNumber, school: student.school,
    },
    sessions: sessionsWithAnalysis,
    ...report,
  });
}
