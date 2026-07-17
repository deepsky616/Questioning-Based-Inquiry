import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { summarizeQuestionTypes } from "@/lib/stats-calc";
import { normalizePointReasonForDisplay } from "@/lib/point-reason-label";
import { countDistinctQuestionGamePlays } from "@/lib/question-game-history";
import { loadQuestionGameLearningHistory } from "@/lib/question-game-history-service";
import {
  isStudentInTeacherScope,
  loadTeacherStudentScope,
} from "@/lib/teacher-student-access";

interface RawEvent { type: "question" | "comment" | "point"; createdAt: string; weight: number; meta?: Record<string, unknown> }
type Params = { params: Promise<{ id: string }> };

export async function GET(
  _req: NextRequest,
  { params }: Params,
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 접근 가능" }, { status: 403 });

  const studentId = id;

  // 교사 권한 검증: 자기 학교/학급 학생인지 확인
  const teacherScope = await loadTeacherStudentScope((session.user as { id: string }).id);
  if (!teacherScope) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true, name: true, grade: true, className: true, studentNumber: true,
      school: true, totalPoints: true, role: true, createdAt: true,
    },
  });

  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!isStudentInTeacherScope(teacherScope, student)) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const [questions, comments, pointLogs] = await Promise.all([
    prisma.question.findMany({
      where: { authorId: studentId },
      select: {
        id: true, createdAt: true, content: true, closure: true, cognitive: true,
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.comment.findMany({
      where: { authorId: studentId },
      select: {
        id: true, createdAt: true, content: true,
        question: { select: { content: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pointLog.findMany({
      where: { studentId, status: "APPROVED" },
      select: { id: true, createdAt: true, points: true, gameId: true, bonusType: true, reason: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const events: RawEvent[] = [
    ...questions.map((q) => ({
      type: "question" as const,
      createdAt: q.createdAt.toISOString(),
      weight: 1,
    })),
    ...comments.map((c) => ({
      type: "comment" as const,
      createdAt: c.createdAt.toISOString(),
      weight: 1,
    })),
    ...pointLogs.map((p) => ({
      type: "point" as const,
      createdAt: p.createdAt.toISOString(),
      weight: p.points,
    })),
  ];

  // 받은 호응(학생 질문에 달린 좋아요·댓글 합)
  const likesReceived = questions.reduce((sum, q) => sum + q._count.likes, 0);
  const commentsReceived = questions.reduce((sum, q) => sum + q._count.comments, 0);
  // 좋은 질문 수 = 교사가 승인한 보너스가 달린 서로 다른 질문 수
  const approvedQ = await prisma.pointLog.findMany({
    where: {
      studentId,
      status: "APPROVED",
      points: { gt: 0 },
      bonusType: {
        in: ["AI_TOPIC_FIT_QUESTION", "AI_DEEP_QUESTION", "TEACHER_ADJUSTED"],
      },
      relatedQuestionId: { not: null },
    },
    select: { relatedQuestionId: true },
  });
  const goodQuestions = new Set(approvedQ.map((p) => p.relatedQuestionId)).size;
  // 같은 친구 방의 참여와 하루 상한 표지는 하나의 실행으로 묶는다.
  const gamePlayLogs = await prisma.pointLog.findMany({
    where: {
      studentId,
      status: "APPROVED",
      OR: [
        { bonusType: "PARTICIPATION" },
        { bonusType: "FRIEND_DAILY_LIMIT" },
        { gameId: "ACTIVITY_SOLO" },
        { gameId: "ACTIVITY_AI" },
      ],
    },
    select: {
      id: true,
      bonusType: true,
      gameId: true,
      roomCode: true,
      gameRunId: true,
    },
  });
  const gamePlays = countDistinctQuestionGamePlays(gamePlayLogs);
  // 질문 분류 분포(분류1 닫힌/열린, 분류2 사실/개념/논쟁)
  const classification = summarizeQuestionTypes(
    questions.map((q) => ({ closure: q.closure ?? "", cognitive: q.cognitive ?? "" })),
  );
  const questionGames = await loadQuestionGameLearningHistory(studentId);

  return NextResponse.json({
    student: {
      id: student.id,
      name: student.name,
      grade: student.grade,
      className: student.className,
      studentNumber: student.studentNumber,
      totalPoints: student.totalPoints,
      questionCount: questions.length,
      commentCount: comments.length,
      likesReceived,
      commentsReceived,
      goodQuestions,
      gamePlays,
    },
    classification,
    questionGames,
    events,
    recentQuestions: questions.slice(0, 10),
    recentComments: comments.slice(0, 10),
    recentPoints: pointLogs.slice(0, 20).map((log) => ({
      ...log,
      reason: normalizePointReasonForDisplay(log.reason),
    })),
  });
}
