import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildActivityReport } from "@/lib/report-stats";
import { summarizeClassSessionActivity } from "@/lib/report-session-activity";
import { compareStudentNumber } from "@/lib/student-sort";
import {
  isClassInTeacherScope,
  loadTeacherStudentScope,
} from "@/lib/teacher-student-access";

// 학급 활동 리포트(교사용)
//  - grade/className 미지정: 교사의 담당 학급 목록 반환(선택용)
//  - grade/className 지정: 해당 학급 전체 학생의 질문·좋아요·댓글 추세 + 학생별 롤업
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const teacherScope = await loadTeacherStudentScope(teacherId);
  if (!teacherScope) {
    return NextResponse.json({ error: "학급 보고서 조회 권한이 없습니다" }, { status: 403 });
  }
  const school = teacherScope.school;

  const grade = req.nextUrl.searchParams.get("grade");
  const className = req.nextUrl.searchParams.get("className");

  // 학급 미지정 → 담당 학급 목록(학생 수 포함)
  if (!grade || !className) {
    if (teacherScope.classes.length === 0) {
      const groupedClasses = await prisma.user.groupBy({
        by: ["grade", "className"],
        where: {
          role: "STUDENT",
          school,
          grade: { not: null },
          className: { not: null },
        },
        _count: { _all: true },
      });
      const classes = groupedClasses
        .flatMap((item) =>
          item.grade?.trim() && item.className?.trim()
            ? [{
                grade: item.grade,
                className: item.className,
                studentCount: item._count._all,
              }]
            : [],
        )
        .sort(
          (left, right) =>
            left.grade.localeCompare(right.grade) ||
            left.className.localeCompare(right.className),
        );
      return NextResponse.json({ scope: "class-list", classes });
    }

    const classes = [...teacherScope.classes].sort(
      (left, right) => left.grade.localeCompare(right.grade) || left.className.localeCompare(right.className),
    );
    const withCounts = await Promise.all(
      classes.map(async (c) => ({
        grade: c.grade,
        className: c.className,
        studentCount: await prisma.user.count({
          where: { role: "STUDENT", school, grade: c.grade, className: c.className },
        }),
      })),
    );
    return NextResponse.json({ scope: "class-list", classes: withCounts });
  }

  if (!isClassInTeacherScope(teacherScope, grade, className)) {
    return NextResponse.json({ error: "담당 학급만 조회할 수 있습니다" }, { status: 403 });
  }

  // 해당 학급 학생들
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", school, grade, className },
    select: { id: true, name: true, studentNumber: true },
  });
  // 번호순 정렬 — studentNumber는 문자열이라 DB 사전순("10"<"2")을 피해 숫자로 비교
  students.sort((a, b) => compareStudentNumber(a.studentNumber, b.studentNumber));
  const ids = students.map((s) => s.id);

  if (ids.length === 0) {
    return NextResponse.json({ error: "해당 학급에 학생이 없습니다" }, { status: 404 });
  }

  const [questions, likesGiven, comments, likesReceived, commentsReceived] = await Promise.all([
    prisma.question.findMany({ where: { authorId: { in: ids } }, select: { createdAt: true, closure: true, cognitive: true, authorId: true } }),
    prisma.questionLike.findMany({ where: { userId: { in: ids } }, select: { createdAt: true, userId: true } }),
    prisma.comment.findMany({ where: { authorId: { in: ids } }, select: { createdAt: true, authorId: true } }),
    prisma.questionLike.findMany({ where: { question: { authorId: { in: ids } } }, select: { createdAt: true } }),
    prisma.comment.findMany({ where: { question: { authorId: { in: ids } } }, select: { createdAt: true } }),
  ]);

  const report = buildActivityReport({ questions, likesGiven, comments, likesReceived, commentsReceived });

  // 학급 학생들이 참여한 수업 세션
  const sessions = await prisma.questionSession.findMany({
    where: {
      OR: [
        { questions: { some: { authorId: { in: ids } } } },
        { questions: { some: { comments: { some: { authorId: { in: ids } } } } } },
        { questions: { some: { likes: { some: { userId: { in: ids } } } } } },
      ],
    },
    select: { id: true, teacherId: true, date: true, subject: true, topic: true },
    orderBy: { date: "desc" },
  });

  // 저장된 세션 AI 분석(학급 전체 관점)을 동봉 → 어느 브라우저·기기에서도 마지막 분석 표시
  const ownedSessionIds = sessions
    .filter((item) => item.teacherId === teacherId)
    .map((item) => item.id);
  const analyses = ownedSessionIds.length > 0
    ? await prisma.sessionAnalysis.findMany({
        where: { sessionId: { in: ownedSessionIds }, scope: "class", studentId: "" },
        select: { sessionId: true, result: true },
      })
    : [];
  const analysisBySession = new Map(analyses.map((a) => [a.sessionId, a.result]));
  const sessionIds = sessions.map((s) => s.id);
  const sessionQuestions = sessionIds.length > 0
    ? await prisma.question.findMany({
        where: {
          sessionId: { in: sessionIds },
          OR: [
            { authorId: { in: ids } },
            { source: "TEACHER_SHARED" },
          ],
        },
        select: {
          id: true,
          sessionId: true,
          _count: { select: { likes: true } },
        },
      })
    : [];
  const sessionQuestionIds = sessionQuestions.map((q) => q.id);
  const sessionComments = sessionQuestionIds.length > 0
    ? await prisma.comment.findMany({
        where: { questionId: { in: sessionQuestionIds }, authorId: { in: ids } },
        select: { questionId: true },
      })
    : [];
  const activityBySession = summarizeClassSessionActivity({
    questions: sessionQuestions.map((q) => ({
      id: q.id,
      sessionId: q.sessionId,
      likeCount: q._count.likes,
    })),
    comments: sessionComments,
  });
  const sessionsWithAnalysis = sessions.map(({ teacherId: _teacherId, ...item }) => ({
    ...item,
    ...(activityBySession.get(item.id) ?? {}),
    analysis: analysisBySession.get(item.id) ?? null,
  }));

  // 학생별 롤업(쓴 활동 기준)
  const perStudent = students.map((s) => ({
    id: s.id,
    name: s.name,
    studentNumber: s.studentNumber,
    questions: questions.filter((q) => q.authorId === s.id).length,
    likesGiven: likesGiven.filter((l) => l.userId === s.id).length,
    comments: comments.filter((c) => c.authorId === s.id).length,
  }));

  return NextResponse.json({
    scope: "class",
    klass: { grade, className, studentCount: students.length, school },
    perStudent,
    sessions: sessionsWithAnalysis,
    ...report,
  });
}
