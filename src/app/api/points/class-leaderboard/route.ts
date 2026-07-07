import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * 반(학교·학년·반) 순위 — 반 학생들의 1인당 평균 포인트 기준.
 * scope: school(교내, 같은 학교의 반들) | all(전체 학교의 반들)
 * - 상위 50개 반 + 본인 반(또는 교사가 지정한 담당 학급) 순위를 함께 반환한다.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { school: true, grade: true, className: true },
  });
  if (!me) return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });

  const scope = req.nextUrl.searchParams.get("scope") ?? "school"; // school | all
  const filterGrade = req.nextUrl.searchParams.get("grade");
  const filterClass = req.nextUrl.searchParams.get("className");

  const where: Record<string, unknown> = {
    role: "STUDENT",
    school: { not: null },
    grade: { not: null },
    className: { not: null },
  };
  if (scope === "school" && me.school) where.school = me.school;

  const groups = await prisma.user.groupBy({
    by: ["school", "grade", "className"],
    where,
    _avg: { totalPoints: true },
    _count: { _all: true },
  });

  // 평균 포인트 내림차순으로 순위 매김 (동점은 공동 순위)
  const sorted = groups
    .map((g) => ({
      school: g.school as string,
      grade: g.grade as string,
      className: g.className as string,
      avgPoints: Math.round((g._avg.totalPoints ?? 0) * 10) / 10,
      memberCount: g._count._all,
    }))
    .sort((a, b) => b.avgPoints - a.avgPoints);

  let prevPoints: number | null = null;
  let prevRank = 0;
  const ranked = sorted.map((c, i) => {
    const rank = prevPoints !== null && c.avgPoints === prevPoints ? prevRank : i + 1;
    prevPoints = c.avgPoints;
    prevRank = rank;
    return { ...c, rank };
  });

  // 본인 반(또는 교사가 지정한 담당 학급)
  const myGrade = filterGrade ?? me.grade;
  const myClassName = filterClass ?? me.className;
  const myClass =
    me.school && myGrade && myClassName
      ? ranked.find(
          (c) => c.school === me.school && c.grade === myGrade && c.className === myClassName,
        ) ?? null
      : null;

  return NextResponse.json({
    scope,
    classes: ranked.slice(0, 50),
    myClass,
    total: ranked.length,
  });
}
