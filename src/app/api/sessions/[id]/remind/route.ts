import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { compareByClassAndNumber } from "@/lib/student-sort";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildSessionLabel } from "@/lib/sessions";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 요청할 수 있습니다" }, { status: 403 });
  }

  const { id } = await params;
  const teacherId = (session.user as { id: string }).id;

  const questionSession = await prisma.questionSession.findUnique({
    where: { id },
    include: { teacher: { select: { name: true } } },
  });

  if (!questionSession) {
    return NextResponse.json({ error: "질문수업을 찾을 수 없습니다" }, { status: 404 });
  }
  if (questionSession.teacherId !== teacherId) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  try {
    const teacher = await prisma.user.findUnique({
      where: { id: teacherId },
      select: {
        school: true,
        teacherClasses: { select: { grade: true, className: true } },
      },
    });

    const classes = teacher?.teacherClasses ?? [];
    const schoolFilter = teacher?.school ? { school: teacher.school } : {};
    const targetIds = Array.isArray(questionSession.targetStudentIds)
      ? questionSession.targetStudentIds.filter((item): item is string => typeof item === "string")
      : [];
    const studentWhere =
      questionSession.targetType === "CLASS" && questionSession.targetGrade && questionSession.targetClassName
        ? {
            role: "STUDENT" as const,
            ...schoolFilter,
            grade: questionSession.targetGrade,
            className: questionSession.targetClassName,
          }
        : questionSession.targetType === "STUDENT" && questionSession.targetStudentId
          ? { role: "STUDENT" as const, id: questionSession.targetStudentId }
          : questionSession.targetType === "CUSTOM" && targetIds.length > 0
            ? { role: "STUDENT" as const, id: { in: targetIds } }
            : {
                role: "STUDENT" as const,
                ...schoolFilter,
                ...(classes.length > 0 && {
                  OR: classes.map((c) => ({ grade: c.grade, className: c.className })),
                }),
              };

    const [students, questions] = await Promise.all([
      prisma.user.findMany({
        where: studentWhere,
        select: {
          id: true,
          name: true,
          grade: true,
          className: true,
          studentNumber: true,
        },
      }),
      prisma.question.findMany({
        where: { sessionId: id, source: { not: "TEACHER_SHARED" } },
        select: { authorId: true },
      }),
    ]);
    students.sort(compareByClassAndNumber);

    const submittedIds = new Set(questions.map((question) => question.authorId));
    const missingStudents = students.filter((student) => !submittedIds.has(student.id));
    if (missingStudents.length === 0) {
      return NextResponse.json({ created: 0, refreshed: 0, totalMissing: 0 });
    }

    const recipientIds = missingStudents.map((student) => student.id);
    const existingNotifications = await prisma.appNotification.findMany({
      where: {
        recipientId: { in: recipientIds },
        senderId: teacherId,
        sessionId: id,
        type: "SESSION_REMINDER",
      },
      select: { recipientId: true },
    });
    const existingRecipientIds = new Set(existingNotifications.map((item) => item.recipientId));

    const sessionTitle = buildSessionLabel(questionSession.date, questionSession.subject, questionSession.topic);
    const href = `/student-ask?sessionId=${id}`;
    await prisma.$transaction(
      missingStudents.map((student) =>
        prisma.appNotification.upsert({
          where: {
            uniq_app_notification_once: {
              recipientId: student.id,
              senderId: teacherId,
              sessionId: id,
              type: "SESSION_REMINDER",
            },
          },
          create: {
            recipientId: student.id,
            senderId: teacherId,
            sessionId: id,
            type: "SESSION_REMINDER",
            title: "수업 질문 작성 요청",
            message: `${questionSession.teacher.name} 선생님이 '${sessionTitle}' 질문 작성을 요청했습니다.`,
            href,
            metadata: {
              teacherName: questionSession.teacher.name,
              sessionTitle,
            },
          },
          update: {
            title: "수업 질문 작성 요청",
            message: `${questionSession.teacher.name} 선생님이 '${sessionTitle}' 질문 작성을 요청했습니다.`,
            href,
            metadata: {
              teacherName: questionSession.teacher.name,
              sessionTitle,
            },
            readAt: null,
          },
        }),
      ),
    );

    return NextResponse.json({
      created: missingStudents.length - existingRecipientIds.size,
      refreshed: existingRecipientIds.size,
      totalMissing: missingStudents.length,
    });
  } catch (error) {
    logger.error("Session reminder notification error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
