import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireTeacherSession } from "@/lib/session-helpers";
import { isValidSessionDateString } from "@/lib/sessions";
import { z } from "zod";

const sessionDateSchema = z.string().trim().refine(isValidSessionDateString);

const createSchema = z.object({
  date: sessionDateSchema,
  subject: z.string().min(1),
  topic: z.string().default(""),
  targetType: z.enum(["ALL", "CLASS", "STUDENT", "CUSTOM"]).optional().default("ALL"),
  targetGrade: z.string().nullable().optional(),
  targetClassName: z.string().nullable().optional(),
  targetStudentId: z.string().nullable().optional(),
  targetStudentIds: z.array(z.string()).optional().default([]),
  defaultQuestionPublic: z.boolean().optional().default(true),
  likesVisibleToPeers: z.boolean().optional().default(true),
  commentsVisibleToPeers: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
});

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sessionTargetsStudent(
  session: {
    targetType: string;
    targetGrade: string | null;
    targetClassName: string | null;
    targetStudentId: string | null;
    targetStudentIds: unknown;
  },
  student: { id: string; grade: string | null; className: string | null },
) {
  const targetStudentIds = jsonStringArray(session.targetStudentIds);
  if (session.targetType === "ALL") return true;
  if (session.targetType === "CLASS") {
    return (
      (session.targetGrade === student.grade && session.targetClassName === student.className) ||
      targetStudentIds.includes(student.id)
    );
  }
  if (session.targetType === "STUDENT") {
    return session.targetStudentId === student.id || targetStudentIds.includes(student.id);
  }
  if (session.targetType === "CUSTOM") return targetStudentIds.includes(student.id);
  return false;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const user = session.user as { id: string; role?: string; grade?: string; className?: string };
  const scheduleOnly = new URL(req.url).searchParams.get("view") === "schedule";

  if (user.role === "TEACHER") {
    if (scheduleOnly) {
      const sessions = await prisma.questionSession.findMany({
        where: { teacherId: user.id, isActive: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          date: true,
          subject: true,
          topic: true,
          isActive: true,
          createdAt: true,
          targetType: true,
          targetGrade: true,
          targetClassName: true,
          targetStudentId: true,
          targetStudentIds: true,
          unitDesignId: true,
          sharedQuestions: true,
        },
      });
      return NextResponse.json(sessions);
    }

    const [sessions, teacher] = await Promise.all([
      prisma.questionSession.findMany({
        where: { teacherId: user.id },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: { teacher: { select: { name: true } } },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          school: true,
          teacherClasses: { select: { grade: true, className: true } },
        },
      }),
    ]);

    if (sessions.length === 0 || !teacher?.school) {
      return NextResponse.json(
        sessions.map((item) => ({
          ...item,
          participation: { total: 0, submitted: 0, missing: 0, percent: 0 },
        })),
      );
    }

    const teacherClasses = teacher.teacherClasses;
    const studentWhere =
      teacherClasses.length === 0
        ? { role: "STUDENT" as const, school: teacher.school }
        : {
            role: "STUDENT" as const,
            school: teacher.school,
            OR: teacherClasses.map((tc) => ({ grade: tc.grade, className: tc.className })),
          };

    const sessionIds = sessions.map((item) => item.id);
    const [students, questionPairs] = await Promise.all([
      prisma.user.findMany({
        where: studentWhere,
        select: { id: true, grade: true, className: true },
      }),
      prisma.question.findMany({
        where: {
          sessionId: { in: sessionIds },
          source: { not: "TEACHER_SHARED" },
        },
        select: { authorId: true, sessionId: true },
      }),
    ]);

    const submittedSet = new Set<string>();
    questionPairs.forEach((question) => {
      if (question.sessionId) submittedSet.add(`${question.sessionId}:${question.authorId}`);
    });

    const sessionsWithParticipation = sessions.map((item) => {
      const targetStudents = students.filter((student) => sessionTargetsStudent(item, student));
      const submitted = targetStudents.filter((student) => submittedSet.has(`${item.id}:${student.id}`)).length;
      const total = targetStudents.length;
      const missing = Math.max(total - submitted, 0);
      const percent = total > 0 ? Math.round((submitted / total) * 100) : 0;
      return {
        ...item,
        participation: { total, submitted, missing, percent },
      };
    });

    return NextResponse.json(sessionsWithParticipation);
  }

  // 학생: 같은 학년·반을 담당하는 교사의 세션만 반환
  if (!user.grade || !user.className) {
    return NextResponse.json([]);
  }

  const teacherClasses = await prisma.teacherClass.findMany({
    where: { grade: user.grade, className: user.className },
    select: { teacherId: true },
  });

  if (teacherClasses.length === 0) {
    return NextResponse.json([]);
  }

  const teacherIds = teacherClasses.map((tc) => tc.teacherId);
  const sessions = await prisma.questionSession.findMany({
    where: {
      teacherId: { in: teacherIds },
      isActive: true,
      OR: [
        { targetType: "ALL" },
        { targetType: "CLASS", targetGrade: user.grade, targetClassName: user.className },
        { targetType: "STUDENT", targetStudentId: user.id },
        { targetType: "CUSTOM", targetStudentIds: { array_contains: user.id } },
      ],
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { teacher: { select: { name: true } } },
  });
  return NextResponse.json(sessions);
}

export async function POST(req: Request) {
  const authResult = requireTeacherSession(await auth());
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  try {
    const body = await req.json();
    const { date, subject, topic, targetType, targetGrade, targetClassName, targetStudentId, targetStudentIds, defaultQuestionPublic, likesVisibleToPeers, commentsVisibleToPeers, isActive } =
      createSchema.parse(body);

    const newSession = await prisma.questionSession.create({
      data: {
        date,
        subject,
        topic,
        teacherId: authResult.user.id,
        targetType,
        targetGrade: targetType === "CLASS" || targetType === "CUSTOM" ? targetGrade ?? null : null,
        targetClassName: targetType === "CLASS" || targetType === "CUSTOM" ? targetClassName ?? null : null,
        targetStudentId: targetType === "STUDENT" ? targetStudentId ?? null : null,
        targetStudentIds: targetType === "CUSTOM" || targetType === "STUDENT" || targetType === "CLASS"
          ? targetStudentIds
          : [],
        defaultQuestionPublic,
        likesVisibleToPeers,
        commentsVisibleToPeers,
        isActive,
      },
    });
    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
