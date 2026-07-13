import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireTeacherSession } from "@/lib/session-helpers";
import { isValidSessionDateString } from "@/lib/sessions";
import { teacherCanUseSessionTarget } from "@/lib/session-access";
import { sessionTargetsStudent } from "@/lib/session-targeting";
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

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const user = session.user as { id: string; role?: string };
  if (user.role !== "TEACHER" && user.role !== "STUDENT") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }
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

  // 학생: DB의 최신 소속 정보를 기준으로 같은 학교·학년·반 담당 교사의 세션만 반환
  const student = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, school: true, grade: true, className: true },
  });
  if (!student?.school || !student.grade || !student.className) {
    return NextResponse.json([]);
  }

  const teachers = await prisma.user.findMany({
    where: {
      role: "TEACHER",
      school: student.school,
      OR: [
        {
          teacherClasses: {
            some: { grade: student.grade, className: student.className },
          },
        },
        { teacherClasses: { none: {} } },
      ],
    },
    select: { id: true },
  });

  const teacherIds = teachers.map((teacher) => teacher.id);
  const sessions = await prisma.questionSession.findMany({
    where: {
      teacherId: { in: teacherIds },
      teacher: { school: student.school },
      isActive: true,
      OR: [
        { targetType: "ALL" },
        { targetType: "CLASS", targetGrade: student.grade, targetClassName: student.className },
        { targetType: "STUDENT", targetStudentId: student.id },
        {
          targetType: { in: ["CLASS", "STUDENT", "CUSTOM"] },
          targetStudentIds: { array_contains: student.id },
        },
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

    const canUseTarget = await teacherCanUseSessionTarget(authResult.user.id, {
      targetType,
      targetGrade: targetGrade ?? null,
      targetClassName: targetClassName ?? null,
      targetStudentId: targetStudentId ?? null,
      targetStudentIds,
    });
    if (!canUseTarget) {
      return NextResponse.json({ error: "질문수업 대상을 지정할 권한이 없습니다" }, { status: 403 });
    }

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
