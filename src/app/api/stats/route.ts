import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calcStartDate } from "@/lib/stats-calc";
import { aggregateTeacherStats } from "@/lib/teacher-stats-aggregate";

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
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "month";
  const view = searchParams.get("view");
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
    if (view === "student-activity") {
      return NextResponse.json({ activeStudentIds: [] });
    }
    return NextResponse.json({
      total: 0,
      byClosure: { closed: 0, open: 0 },
      byCognitive: { factual: 0, conceptual: 0, controversial: 0 },
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

  if (view === "student-activity") {
    const studentGroups = await prisma.question.groupBy({
      by: ["authorId"],
      where: {
        createdAt: { gte: startDate },
        author: authorFilter,
      },
    });
    return NextResponse.json({
      activeStudentIds: studentGroups.map((group) => group.authorId),
    });
  }

  const questions = await prisma.question.findMany({
    where: {
      createdAt: { gte: startDate },
      author: authorFilter,
    },
    select: {
      createdAt: true,
      closure: true,
      cognitive: true,
      author: {
        select: { id: true, name: true, className: true, grade: true, studentNumber: true },
      },
    },
  });

  const stats = aggregateTeacherStats(questions, startDate, now);

  return NextResponse.json({
    ...stats,
    school, // 교사 소속 학교 (학급 드롭다운 표기용)
    teacherClasses, // 프론트엔드 학급 드롭다운 구성용
  });
}
