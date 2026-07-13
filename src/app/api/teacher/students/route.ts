import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { compareByClassAndNumber } from "@/lib/student-sort";
import { buildStudentSessionProgress } from "@/lib/dashboard-priority-tasks";
import { isValidSessionDateString } from "@/lib/sessions";
import { localDateKey } from "@/lib/dashboard-question-class-schedule";

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }

  const teacherId = (session.user as { id: string }).id;
  const searchParams = new URL(req.url).searchParams;
  const requestedView = searchParams.get("view");
  const view = requestedView === "activity"
    ? "activity"
    : requestedView === "directory"
      ? "directory"
      : "legacy";

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: {
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });

  if (!teacher) {
    return NextResponse.json({ error: "교사 정보를 찾을 수 없습니다" }, { status: 404 });
  }

  // school 미설정이면 빈 목록 반환
  if (!teacher.school) {
    return NextResponse.json(
      view === "activity"
        ? { activity: [] }
        : { students: [], teacherClasses: [] },
    );
  }

  const teacherClasses = teacher.teacherClasses;

  // teacherClasses가 없으면 같은 학교 학생 전체, 있으면 해당 학년·반만
  const studentWhere =
    teacherClasses.length === 0
      ? { role: "STUDENT" as const, school: teacher.school }
      : {
          role: "STUDENT" as const,
          school: teacher.school,
          OR: teacherClasses.map((tc) => ({ grade: tc.grade, className: tc.className })),
        };

  if (view === "directory") {
    const students = await prisma.user.findMany({
      where: studentWhere,
      select: {
        id: true,
        name: true,
        grade: true,
        className: true,
        studentNumber: true,
      },
    });
    students.sort(compareByClassAndNumber);
    return NextResponse.json({
      students: students.map((student) => ({
        id: student.id,
        name: student.name,
        grade: student.grade ?? "",
        className: student.className ?? "",
        studentNumber: student.studentNumber ?? "",
      })),
      teacherClasses,
    });
  }

  const requestedToday = searchParams.get("today") ?? "";
  const today = isValidSessionDateString(requestedToday)
    ? requestedToday
    : localDateKey();
  const students = await prisma.user.findMany({
    where: studentWhere,
    select: {
      id: true,
      ...(view === "legacy" ? { name: true, school: true } : {}),
      grade: true,
      className: true,
      studentNumber: true,
      totalPoints: true,
      _count: {
        select: {
          questions: true,
          comments: true,
          ...(view === "legacy" ? { pointLogs: true } : {}),
        },
      },
    },
  });
  students.sort(compareByClassAndNumber);

  // 마지막 활동일(질문·댓글 중 최신) — 학생별 max createdAt
  const ids = students.map((s) => s.id);
  const [qMax, cMax, sessions, questionPairs] = ids.length
    ? await Promise.all([
        prisma.question.groupBy({ by: ["authorId"], where: { authorId: { in: ids } }, _max: { createdAt: true } }),
        prisma.comment.groupBy({ by: ["authorId"], where: { authorId: { in: ids } }, _max: { createdAt: true } }),
        prisma.questionSession.findMany({
          where: { teacherId, isActive: true },
          select: {
            id: true,
            date: true,
            targetType: true,
            targetGrade: true,
            targetClassName: true,
            targetStudentId: true,
            targetStudentIds: true,
          },
        }),
        prisma.question.groupBy({
          by: ["authorId", "sessionId"],
          where: { authorId: { in: ids }, sessionId: { not: null }, source: { not: "TEACHER_SHARED" } },
        }),
      ])
    : [[], [], [], []];
  const lastActivity = new Map<string, number>();
  for (const r of qMax) if (r._max.createdAt) lastActivity.set(r.authorId, r._max.createdAt.getTime());
  for (const r of cMax) {
    const t = r._max.createdAt?.getTime();
    if (t && t > (lastActivity.get(r.authorId) ?? 0)) lastActivity.set(r.authorId, t);
  }
  const answeredByStudent = new Map<string, Set<string>>();
  for (const pair of questionPairs) {
    if (!pair.sessionId) continue;
    const set = answeredByStudent.get(pair.authorId) ?? new Set<string>();
    set.add(pair.sessionId);
    answeredByStudent.set(pair.authorId, set);
  }

  const normalizedSessions = sessions.map((questionSession) => {
    const { targetStudentIds, ...sessionFields } = questionSession;
    return {
      ...sessionFields,
      targetStudentIds: new Set(jsonStringArray(targetStudentIds)),
    };
  });
  const visibleSessionsFor = (student: (typeof students)[number]) =>
    normalizedSessions.filter((s) => {
      const targetStudentIds = s.targetStudentIds;
      if (s.targetType === "ALL") return true;
      if (s.targetType === "CLASS") {
        return (
          (s.targetGrade === student.grade && s.targetClassName === student.className) ||
          targetStudentIds.has(student.id)
        );
      }
      if (s.targetType === "STUDENT") {
        return s.targetStudentId === student.id || targetStudentIds.has(student.id);
      }
      if (s.targetType === "CUSTOM") return targetStudentIds.has(student.id);
      return false;
    });

  const activity = students.map((s) => {
      const visibleSessions = visibleSessionsFor(s);
      const answered = answeredByStudent.get(s.id) ?? new Set<string>();
      return {
        studentId: s.id,
        questionCount: s._count.questions,
        commentCount: s._count.comments,
        totalPoints: s.totalPoints,
        lastActivityAt: lastActivity.has(s.id) ? new Date(lastActivity.get(s.id)!).toISOString() : null,
        sessionProgress: buildStudentSessionProgress({
          sessions: visibleSessions,
          completedSessionIds: answered,
          today,
        }),
      };
    });

  if (view === "activity") {
    return NextResponse.json({ activity });
  }

  const legacyStudents = students as Array<(typeof students)[number] & {
    name: string;
    school: string | null;
    _count: (typeof students)[number]["_count"] & { pointLogs: number };
  }>;
  const activityByStudent = new Map(activity.map((item) => [item.studentId, item]));
  return NextResponse.json({
    students: legacyStudents.map((student) => {
      const studentActivity = activityByStudent.get(student.id)!;
      return {
        id: student.id,
        name: student.name,
        grade: student.grade ?? "",
        className: student.className ?? "",
        studentNumber: student.studentNumber ?? "",
        school: student.school ?? "",
        questionCount: studentActivity.questionCount,
        commentCount: studentActivity.commentCount,
        pointLogCount: student._count.pointLogs,
        totalPoints: studentActivity.totalPoints,
        lastActivityAt: studentActivity.lastActivityAt,
        sessionProgress: studentActivity.sessionProgress,
      };
    }),
    teacherClasses,
  });
}
