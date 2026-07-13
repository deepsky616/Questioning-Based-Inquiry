import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * 개인 포인트 순위.
 * scope: class(우리반) | school(교내) | all(전체 학교)
 * - 교사는 grade/className 파라미터로 특정 담당 학급을 우리반으로 조회할 수 있다.
 * - 상위 50명 + 본인(학생) 순위/정보를 함께 반환한다.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      school: true,
      grade: true,
      className: true,
      studentNumber: true,
      name: true,
      totalPoints: true,
      role: true,
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

  const scope = req.nextUrl.searchParams.get("scope") ?? "class"; // class | school | all
  const filterGrade = req.nextUrl.searchParams.get("grade");
  const filterClass = req.nextUrl.searchParams.get("className");

  const where: Record<string, unknown> = { role: "STUDENT" };
  if (scope !== "all") where.school = me.school;
  if (scope === "class") {
    const grade = me.role === "TEACHER" ? filterGrade : me.grade;
    const className = me.role === "TEACHER" ? filterClass : me.className;
    if (!grade || !className) {
      return NextResponse.json({ error: "학급 정보가 필요합니다" }, { status: 400 });
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
    where.grade = grade;
    where.className = className;
  }

  const [students, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        school: true,
        grade: true,
        className: true,
        studentNumber: true,
        totalPoints: true,
      },
      orderBy: [{ totalPoints: "desc" }, { name: "asc" }],
      take: 50,
    }),
    prisma.user.count({ where }),
  ]);

  // 본인(학생) 순위: 같은 범위에서 본인보다 포인트가 높은 학생 수 + 1 (동점은 공동 순위)
  let myRank: number | null = null;
  if (me.role === "STUDENT") {
    const higher = await prisma.user.count({
      where: { ...where, totalPoints: { gt: me.totalPoints } },
    });
    myRank = higher + 1;
  }

  return NextResponse.json({
    scope,
    students,
    total,
    me: {
      id: userId,
      name: me.name,
      school: me.school,
      grade: me.grade,
      className: me.className,
      studentNumber: me.studentNumber,
      totalPoints: me.totalPoints,
      rank: myRank,
    },
  });
}
