import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BUILT_IN_GAMES, AnyGame, GameVisibility } from "@/lib/question-games-data";
import { randomBytes } from "crypto";

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

  const [visConfig, gamesConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: `question_game_vis_${teacherId}` } }),
    prisma.systemConfig.findUnique({ where: { key: `question_game_custom_${teacherId}` } }),
  ]);

  const visibilityMap: Record<string, GameVisibility> = visConfig
    ? (() => { try { return JSON.parse(visConfig.value); } catch { return {}; } })()
    : {};

  const customGames: AnyGame[] = gamesConfig
    ? (() => {
        try {
          const games = JSON.parse(gamesConfig.value) as Omit<AnyGame, "isBuiltIn">[];
          return games.map((g) => ({ ...g, isBuiltIn: false, teacherId } as AnyGame));
        } catch {
          return [];
        }
      })()
    : [];

  const allGames = [...BUILT_IN_GAMES, ...customGames];
  return NextResponse.json({ games: allGames, visibilityMap });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;

  const body = await req.json();
  const { title, description, emoji, gradientCss, accentColor, playerCount, duration, instructions } = body;

  if (!title || !description || !emoji || !gradientCss) {
    return NextResponse.json({ error: "필수 항목이 누락되었습니다" }, { status: 400 });
  }

  const gamesConfig = await prisma.systemConfig.findUnique({
    where: { key: `question_game_custom_${teacherId}` },
  });

  const existing: Omit<AnyGame, "isBuiltIn" | "teacherId">[] = gamesConfig
    ? (() => { try { return JSON.parse(gamesConfig.value); } catch { return []; } })()
    : [];

  const newGame = {
    id: `custom-${randomBytes(4).toString("hex")}`,
    title,
    description,
    emoji,
    gradientCss,
    accentColor: accentColor ?? "#6366f1",
    playerCount: playerCount ?? "제한없음",
    duration: duration ?? "20분",
    instructions: instructions ?? [],
    order: 100 + existing.length,
  };

  const updated = [...existing, newGame];

  await prisma.systemConfig.upsert({
    where: { key: `question_game_custom_${teacherId}` },
    update: { value: JSON.stringify(updated) },
    create: { key: `question_game_custom_${teacherId}`, value: JSON.stringify(updated) },
  });

  return NextResponse.json({ game: { ...newGame, isBuiltIn: false, teacherId } }, { status: 201 });
}
