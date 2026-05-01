import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calcTrend, calcStartDate, aggregateByStudent, buildTimeline } from "@/lib/stats-calc";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }

  const teacherId = (session.user as { id: string }).id;
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "month";
  const filterGrade = searchParams.get("grade");
  const filterClass = searchParams.get("className");

  const now = new Date();
  const startDate = calcStartDate(period, now);

  // 교사의 학교·담당 학년반 조회
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: {
      school: true,
      teacherClasses: {
        select: { grade: true, className: true },
        orderBy: [{ grade: "asc" }, { className: "asc" }],
      },
    },
  });

  // 교사 정보 없거나 학교 미설정이면 빈 데이터 반환
  if (!teacher?.school) {
    return NextResponse.json({
      total: 0,
      byClosure: { closed: 0, open: 0 },
      byCognitive: { factual: 0, interpretive: 0, evaluative: 0 },
      byStudent: [],
      timeline: [],
      teacherClasses: teacher?.teacherClasses ?? [],
    });
  }

  const { school, teacherClasses } = teacher;

  // 특정 학년+반 필터 — 교사의 담당 학급인지 검증
  let authorFilter: Record<string, unknown>;

  if (filterGrade && filterClass) {
    const isAllowed =
      teacherClasses.length === 0 ||
      teacherClasses.some(
        (tc) => tc.grade === filterGrade && tc.className === filterClass
      );

    authorFilter = isAllowed
      ? { role: "STUDENT", school, grade: filterGrade, className: filterClass }
      : { id: "" }; // 비허가 학급 → 결과 없음
  } else if (teacherClasses.length > 0) {
    // 담당 학급 전체
    authorFilter = {
      role: "STUDENT",
      school,
      OR: teacherClasses.map((tc) => ({
        grade: tc.grade,
        className: tc.className,
      })),
    };
  } else {
    // teacherClasses 미설정 → 같은 학교 학생 전체
    authorFilter = { role: "STUDENT", school };
  }

  const questions = await prisma.question.findMany({
    where: {
      createdAt: { gte: startDate },
      author: authorFilter,
    },
    include: {
      author: {
        select: { id: true, name: true, className: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const total = questions.length;

  const byClosure = {
    closed: questions.filter((q) => q.closure === "closed").length,
    open: questions.filter((q) => q.closure === "open").length,
  };

  const byCognitive = {
    factual: questions.filter((q) => q.cognitive === "factual").length,
    interpretive: questions.filter((q) => q.cognitive === "interpretive").length,
    evaluative: questions.filter((q) => q.cognitive === "evaluative").length,
  };

  const midpoint = new Date(
    startDate.getTime() + (now.getTime() - startDate.getTime()) / 2
  );
  const firstHalf = questions.filter((q) => q.createdAt < midpoint);
  const secondHalf = questions.filter((q) => q.createdAt >= midpoint);

  const byStudentBase = aggregateByStudent(
    questions.map((q) => ({
      ...q,
      closure: q.closure as "closed" | "open",
      cognitive: q.cognitive as "factual" | "interpretive" | "evaluative",
      author: { id: q.author.id, name: q.author.name, className: q.author.className },
    }))
  );

  const byStudent = byStudentBase.map((student) => {
    const s1 = firstHalf.filter((q) => q.author.id === student.studentId).length;
    const s2 = secondHalf.filter((q) => q.author.id === student.studentId).length;
    return { ...student, trend: calcTrend(s1, s2) };
  });

  const timeline = buildTimeline(
    questions.map((q) => ({
      ...q,
      closure: q.closure as "closed" | "open",
      cognitive: q.cognitive as "factual" | "interpretive" | "evaluative",
      author: { id: q.author.id, name: q.author.name, className: q.author.className },
    }))
  );

  return NextResponse.json({
    total,
    byClosure,
    byCognitive,
    byStudent,
    timeline,
    teacherClasses, // 프론트엔드 학급 드롭다운 구성용
  });
}
