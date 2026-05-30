import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface RawEvent { type: "question" | "comment" | "point"; createdAt: string; weight: number; meta?: Record<string, unknown> }

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 접근 가능" }, { status: 403 });

  const studentId = params.id;

  // 교사 권한 검증: 자기 학교/학급 학생인지 확인
  const [teacher, student] = await Promise.all([
    prisma.user.findUnique({
      where: { id: (session.user as { id: string }).id },
      select: { school: true, teacherClasses: { select: { grade: true, className: true } } },
    }),
    prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true, name: true, grade: true, className: true, studentNumber: true,
        school: true, totalPoints: true, role: true, createdAt: true,
      },
    }),
  ]);

  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!teacher || teacher.school !== student.school) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }
  if (teacher.teacherClasses.length > 0) {
    const inClass = teacher.teacherClasses.some(
      (c) => c.grade === student.grade && c.className === student.className
    );
    if (!inClass) return NextResponse.json({ error: "담당 학생이 아닙니다" }, { status: 403 });
  }

  const [questions, comments, pointLogs] = await Promise.all([
    prisma.question.findMany({
      where: { authorId: studentId },
      select: { id: true, createdAt: true, content: true, closure: true, cognitive: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.comment.findMany({
      where: { authorId: studentId },
      select: { id: true, createdAt: true, content: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pointLog.findMany({
      where: { studentId },
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
    },
    events,
    recentQuestions: questions.slice(0, 10),
    recentComments: comments.slice(0, 10),
    recentPoints: pointLogs.slice(0, 20),
  });
}
