import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * 한 학급(같은 학교·학년·반) 학생들의 우리반/교내/전체 순위를 출석번호순으로 반환한다.
 * 개인정보 보호: 다른 학교·학년·반 학생의 데이터는 순위 계산에만 쓰고 응답에 포함하지 않는다.
 * - 학생: 본인 학급 기준
 * - 교사: grade/className 파라미터로 담당 학급 지정
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      school: true,
      grade: true,
      className: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });
  if (!me) return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
  if (me.role !== "TEACHER" && me.role !== "STUDENT") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }
  if (!me.school) {
    return NextResponse.json({ error: "소속 학교 정보가 없습니다" }, { status: 403 });
  }

  const school = me.school;
  const grade = me.role === "TEACHER" ? req.nextUrl.searchParams.get("grade") : me.grade;
  const className = me.role === "TEACHER" ? req.nextUrl.searchParams.get("className") : me.className;

  if (!grade || !className) {
    return NextResponse.json({ klass: null, students: [], total: 0 });
  }
  if (
    me.role === "TEACHER" &&
    me.teacherClasses.length > 0 &&
    !me.teacherClasses.some(
      (item) => item.grade === grade && item.className === className,
    )
  ) {
    return NextResponse.json({ error: "담당 학급만 조회할 수 있습니다" }, { status: 403 });
  }

  const [classStudents, schoolRows, allRows] = await Promise.all([
    prisma.user.findMany({
      where: { role: "STUDENT", school, grade, className },
      select: { id: true, name: true, studentNumber: true, totalPoints: true },
    }),
    prisma.user.findMany({
      where: { role: "STUDENT", school },
      select: { totalPoints: true },
    }),
    prisma.user.findMany({ where: { role: "STUDENT" }, select: { totalPoints: true } }),
  ]);

  const classPoints = classStudents.map((s) => s.totalPoints);
  const schoolPoints = schoolRows.map((s) => s.totalPoints);
  const allPoints = allRows.map((s) => s.totalPoints);
  // 동점은 공동 순위(자신보다 높은 점수 수 + 1)
  const rankIn = (arr: number[], p: number) => arr.filter((x) => x > p).length + 1;

  const students = classStudents
    .map((s) => ({
      id: s.id,
      name: s.name,
      studentNumber: s.studentNumber,
      totalPoints: s.totalPoints,
      classRank: rankIn(classPoints, s.totalPoints),
      schoolRank: rankIn(schoolPoints, s.totalPoints),
      allRank: rankIn(allPoints, s.totalPoints),
      isMe: me.role === "STUDENT" && s.id === me.id,
    }))
    .sort((a, b) => {
      const na = parseInt(a.studentNumber ?? "", 10);
      const nb = parseInt(b.studentNumber ?? "", 10);
      return (Number.isNaN(na) ? Infinity : na) - (Number.isNaN(nb) ? Infinity : nb);
    });

  return NextResponse.json({
    klass: { school, grade, className },
    students,
    total: students.length,
    schoolTotal: schoolRows.length,
    allTotal: allRows.length,
  });
}
