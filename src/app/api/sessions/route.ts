import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireTeacherSession } from "@/lib/session-helpers";
import { isValidSessionDateString } from "@/lib/sessions";
import { sessionTargetsStudent } from "@/lib/session-targeting";
import {
  lockSessionWriteLifecycles,
  normalizeSessionTarget,
  revalidateSessionTargetAfterLifecycleLocks,
} from "@/lib/session-write-access";
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

type SessionGradeSource = {
  unitDesignId?: string | null;
  targetGrade?: string | null;
};

async function loadUnitDesignGrades(
  sessions: SessionGradeSource[],
  teacherId?: string,
): Promise<Map<string, string>> {
  const unitDesignIds = Array.from(
    new Set(
      sessions
        .map((item) => item.unitDesignId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (unitDesignIds.length === 0) return new Map();

  const designs = await prisma.unitDesign.findMany({
    where: {
      id: { in: unitDesignIds },
      ...(teacherId ? { teacherId } : {}),
    },
    select: { id: true, grade: true },
  });
  return new Map(
    designs
      .filter((design): design is typeof design & { grade: string } => Boolean(design.grade))
      .map((design) => [design.id, design.grade]),
  );
}

function preferredSessionGrade(
  session: SessionGradeSource,
  unitDesignGrades: Map<string, string>,
  fallbackGrade?: string | null,
): string | null {
  return (
    (session.unitDesignId ? unitDesignGrades.get(session.unitDesignId) : null)
    ?? session.targetGrade
    ?? fallbackGrade
    ?? null
  );
}

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
      return NextResponse.json(
        sessions.map((item) => ({
          ...item,
          grade: item.targetGrade ?? null,
        })),
      );
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
    const unitDesignGrades = await loadUnitDesignGrades(sessions, user.id);
    const teacherClassGrades = Array.from(
      new Set((teacher?.teacherClasses ?? []).map((item) => item.grade).filter(Boolean)),
    );
    const teacherGradeFallback = teacherClassGrades.length === 1 ? teacherClassGrades[0] : null;

    if (sessions.length === 0 || !teacher?.school) {
      return NextResponse.json(
        sessions.map((item) => ({
          ...item,
          grade: preferredSessionGrade(item, unitDesignGrades, teacherGradeFallback),
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
      const targetGrades = Array.from(
        new Set(targetStudents.map((student) => student.grade).filter(Boolean)),
      );
      const targetGradeFallback = targetGrades.length === 1
        ? targetGrades[0]
        : teacherGradeFallback;
      return {
        ...item,
        grade: preferredSessionGrade(item, unitDesignGrades, targetGradeFallback),
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
  const unitDesignGrades = await loadUnitDesignGrades(sessions);
  return NextResponse.json(
    sessions.map((item) => ({
      ...item,
      grade: preferredSessionGrade(item, unitDesignGrades, student.grade),
    })),
  );
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

    const target = normalizeSessionTarget({
      targetType,
      targetGrade: targetGrade ?? null,
      targetClassName: targetClassName ?? null,
      targetStudentId: targetStudentId ?? null,
      targetStudentIds,
    });
    const result = await prisma.$transaction(async (tx) => {
      await lockSessionWriteLifecycles(tx, authResult.user.id, target);
      if (!(await revalidateSessionTargetAfterLifecycleLocks(tx, authResult.user.id, target))) {
        return { kind: "forbidden" } as const;
      }

      const newSession = await tx.questionSession.create({
        data: {
          date,
          subject,
          topic,
          teacherId: authResult.user.id,
          ...target,
          defaultQuestionPublic,
          likesVisibleToPeers,
          commentsVisibleToPeers,
          isActive,
        },
      });
      return { kind: "created", session: newSession } as const;
    });
    if (result.kind === "forbidden") {
      return NextResponse.json({ error: "질문수업 대상을 지정할 권한이 없습니다" }, { status: 403 });
    }
    return NextResponse.json(result.session, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
