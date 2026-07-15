import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  BUILT_IN_GAMES,
  normalizeQuestionGameTheme,
  sortGamesByOrder,
} from "@/lib/question-games-data";
import { createQuestionGame, loadQuestionGameSettings } from "@/lib/question-game-settings-store";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;

  const { customGames, visibilityMap, orderIds } = await loadQuestionGameSettings(teacherId);

  const allGames = sortGamesByOrder(
    [...BUILT_IN_GAMES, ...customGames],
    orderIds,
  ).map(normalizeQuestionGameTheme);
  return NextResponse.json({ games: allGames, visibilityMap });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
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

  const newGame = await createQuestionGame(teacherId, {
    title,
    description,
    emoji,
    gradientCss,
    accentColor: accentColor ?? "#6366f1",
    playerCount: playerCount ?? "제한없음",
    duration: duration ?? "20분",
    instructions: instructions ?? [],
  });

  return NextResponse.json(
    { game: normalizeQuestionGameTheme(newGame) },
    { status: 201 },
  );
}
