import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }

  const teacherId = (session.user as { id: string }).id;

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
    return NextResponse.json({ students: [], teacherClasses: [] });
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

  const students = await prisma.user.findMany({
    where: studentWhere,
    select: {
      id: true,
      name: true,
      grade: true,
      className: true,
      studentNumber: true,
      school: true,
      totalPoints: true,
      _count: { select: { questions: true, comments: true, pointLogs: true } },
    },
    orderBy: [{ grade: "asc" }, { className: "asc" }, { studentNumber: "asc" }],
  });

  // 마지막 활동일(질문·댓글 중 최신) — 학생별 max createdAt
  const ids = students.map((s) => s.id);
  const [qMax, cMax] = ids.length
    ? await Promise.all([
        prisma.question.groupBy({ by: ["authorId"], where: { authorId: { in: ids } }, _max: { createdAt: true } }),
        prisma.comment.groupBy({ by: ["authorId"], where: { authorId: { in: ids } }, _max: { createdAt: true } }),
      ])
    : [[], []];
  const lastActivity = new Map<string, number>();
  for (const r of qMax) if (r._max.createdAt) lastActivity.set(r.authorId, r._max.createdAt.getTime());
  for (const r of cMax) {
    const t = r._max.createdAt?.getTime();
    if (t && t > (lastActivity.get(r.authorId) ?? 0)) lastActivity.set(r.authorId, t);
  }

  // 분류1(폐쇄/개방)·분류2(사실/개념/논쟁) 학생별 분포 — 목록 미니 막대용
  const [closureRows, cognitiveRows] = ids.length
    ? await Promise.all([
        prisma.question.groupBy({ by: ["authorId", "closure"], where: { authorId: { in: ids } }, _count: { _all: true } }),
        prisma.question.groupBy({ by: ["authorId", "cognitive"], where: { authorId: { in: ids } }, _count: { _all: true } }),
      ])
    : [[], []];
  const closureDist = new Map<string, { closed: number; open: number }>();
  for (const r of closureRows) {
    const cur = closureDist.get(r.authorId) ?? { closed: 0, open: 0 };
    if (r.closure === "closed") cur.closed += r._count._all;
    else if (r.closure === "open") cur.open += r._count._all;
    closureDist.set(r.authorId, cur);
  }
  const cognitiveDist = new Map<string, { factual: number; conceptual: number; controversial: number }>();
  for (const r of cognitiveRows) {
    const cur = cognitiveDist.get(r.authorId) ?? { factual: 0, conceptual: 0, controversial: 0 };
    if (r.cognitive === "factual") cur.factual += r._count._all;
    else if (r.cognitive === "conceptual") cur.conceptual += r._count._all;
    else if (r.cognitive === "controversial") cur.controversial += r._count._all;
    cognitiveDist.set(r.authorId, cur);
  }

  return NextResponse.json({
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      grade: s.grade ?? "",
      className: s.className ?? "",
      studentNumber: s.studentNumber ?? "",
      school: s.school ?? "",
      questionCount: s._count.questions,
      commentCount: s._count.comments,
      pointLogCount: s._count.pointLogs,
      totalPoints: s.totalPoints,
      lastActivityAt: lastActivity.has(s.id) ? new Date(lastActivity.get(s.id)!).toISOString() : null,
      closureDist: closureDist.get(s.id) ?? { closed: 0, open: 0 },
      cognitiveDist: cognitiveDist.get(s.id) ?? { factual: 0, conceptual: 0, controversial: 0 },
    })),
    teacherClasses,
  });
}
