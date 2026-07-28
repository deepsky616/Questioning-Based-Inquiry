import { prisma } from "@/lib/db";
import { buildActivityReport } from "@/lib/report-stats";
import { summarizeStudentSessionActivity } from "@/lib/report-session-activity";

export async function buildStudentReport(targetId: string) {
  const student = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, role: true, grade: true, className: true, studentNumber: true, school: true },
  });
  if (!student || student.role !== "STUDENT") return null;

  const [questions, likesGiven, comments, likesReceived, commentsReceived, sessions] = await Promise.all([
    prisma.question.findMany({ where: { authorId: targetId }, select: { createdAt: true, closure: true, cognitive: true } }),
    prisma.questionLike.findMany({ where: { userId: targetId }, select: { createdAt: true } }),
    prisma.comment.findMany({ where: { authorId: targetId }, select: { createdAt: true } }),
    prisma.questionLike.findMany({ where: { question: { authorId: targetId } }, select: { createdAt: true } }),
    prisma.comment.findMany({ where: { question: { authorId: targetId } }, select: { createdAt: true } }),
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

  const sessionIds = sessions.map((s) => s.id);
  const analyses = sessionIds.length > 0
    ? await prisma.sessionAnalysis.findMany({
        where: { sessionId: { in: sessionIds }, scope: "student", studentId: targetId },
        select: { sessionId: true, result: true },
      })
    : [];
  const analysisBySession = new Map(analyses.map((a) => [a.sessionId, a.result]));
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
    grade: student.grade,
    ...(activityBySession.get(s.id) ?? {}),
    analysis: analysisBySession.get(s.id) ?? null,
  }));

  return {
    scope: "student",
    student: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      className: student.className,
      studentNumber: student.studentNumber,
      school: student.school,
    },
    sessions: sessionsWithAnalysis,
    ...report,
  };
}
