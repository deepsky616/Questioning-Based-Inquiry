import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  BUILT_IN_GAMES,
  AnyGame,
  GameVisibility,
  isGameVisibleToStudent,
  sortGamesByOrder,
} from "@/lib/question-games-data";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;

  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: { grade: true, className: true },
  });

  // 학생의 담당 선생님 찾기
  let teacherIds: string[] = [];
  if (student?.grade && student?.className) {
    const teacherClasses = await prisma.teacherClass.findMany({
      where: { grade: student.grade, className: student.className },
      select: { teacherId: true },
    });
    teacherIds = teacherClasses.map((tc) => tc.teacherId);
  }

  // 선생님 없으면 기본 게임 전체 노출
  if (teacherIds.length === 0) {
    return NextResponse.json(BUILT_IN_GAMES);
  }

  // 각 선생님의 visibility 설정 및 커스텀 게임 수집
  const visibilityMap: Record<string, GameVisibility> = {};
  const customGames: AnyGame[] = [];

  for (const teacherId of teacherIds) {
    const [visConfig, gamesConfig] = await Promise.all([
      prisma.systemConfig.findUnique({
        where: { key: `question_game_vis_${teacherId}` },
      }),
      prisma.systemConfig.findUnique({
        where: { key: `question_game_custom_${teacherId}` },
      }),
    ]);

    if (visConfig) {
      try {
        const vis = JSON.parse(visConfig.value) as Record<string, GameVisibility>;
        Object.assign(visibilityMap, vis);
      } catch {}
    }

    if (gamesConfig) {
      try {
        const games = JSON.parse(gamesConfig.value) as Omit<AnyGame, "isBuiltIn">[];
        games.forEach((g) =>
          customGames.push({ ...g, isBuiltIn: false, teacherId } as AnyGame)
        );
      } catch {}
    }
  }

  // 가시성 필터링
  const allGames: AnyGame[] = [...BUILT_IN_GAMES, ...customGames];
  const filtered = allGames.filter((game) => {
    const vis: GameVisibility = visibilityMap[game.id] ?? { type: "all" };
    return isGameVisibleToStudent(vis, {
      grade: student?.grade,
      className: student?.className,
      id: userId,
    });
  });

  // 담당 교사가 지정한 순서(첫 교사 기준) 적용
  let orderIds: string[] | null = null;
  for (const teacherId of teacherIds) {
    const orderConfig = await prisma.systemConfig.findUnique({ where: { key: `question_game_order_${teacherId}` } });
    if (orderConfig) {
      try { orderIds = JSON.parse(orderConfig.value) as string[]; break; } catch {}
    }
  }

  return NextResponse.json(sortGamesByOrder(filtered, orderIds));
}
