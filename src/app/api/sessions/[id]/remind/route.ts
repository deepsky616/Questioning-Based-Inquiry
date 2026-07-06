import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { compareByClassAndNumber } from "@/lib/student-sort";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildSessionLabel } from "@/lib/sessions";
import { canSendExternalEmail, isEmailEnabled, sendSessionReminderEmail } from "@/lib/email";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ error: "세션을 찾을 수 없습니다" }, { status: 404 });
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
          email: true,
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
    const emailTargets = missingStudents.filter((student) => student.email && canSendExternalEmail(student.email));
    const skippedNoEmail = missingStudents.length - emailTargets.length;

    if (!isEmailEnabled()) {
      return NextResponse.json({
        sent: 0,
        failed: 0,
        skippedNoEmail,
        skippedEmailDisabled: emailTargets.length,
        totalMissing: missingStudents.length,
      });
    }

    const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
    const askUrl = new URL("/student-ask", origin);
    askUrl.searchParams.set("sessionId", id);
    const sessionTitle = buildSessionLabel(questionSession.date, questionSession.subject, questionSession.topic);

    let sent = 0;
    let failed = 0;
    for (const student of emailTargets) {
      const result = await sendSessionReminderEmail({
        to: student.email!,
        studentName: student.name,
        teacherName: questionSession.teacher.name,
        sessionTitle,
        askUrl: askUrl.toString(),
      });
      if (result.ok && !result.skipped) sent += 1;
      if (!result.ok) {
        failed += 1;
        logger.error("Session reminder email error:", result.error);
      }
    }

    return NextResponse.json({
      sent,
      failed,
      skippedNoEmail,
      skippedEmailDisabled: 0,
      totalMissing: missingStudents.length,
    });
  } catch (error) {
    logger.error("Session reminder error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
