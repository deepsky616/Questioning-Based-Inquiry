import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GameVisibility, AnyGame } from "@/lib/question-games-data";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;
  const gameId = params.id;

  const body = await req.json();

  // visibility 업데이트
  if ("visibility" in body) {
    const newVisibility: GameVisibility = body.visibility;
    const visConfig = await prisma.systemConfig.findUnique({
      where: { key: `question_game_vis_${teacherId}` },
    });
    const currentMap: Record<string, GameVisibility> = visConfig
      ? (() => { try { return JSON.parse(visConfig.value); } catch { return {}; } })()
      : {};

    currentMap[gameId] = newVisibility;

    await prisma.systemConfig.upsert({
      where: { key: `question_game_vis_${teacherId}` },
      update: { value: JSON.stringify(currentMap) },
      create: { key: `question_game_vis_${teacherId}`, value: JSON.stringify(currentMap) },
    });
    return NextResponse.json({ ok: true });
  }

  // 커스텀 게임 정보 수정
  const gamesConfig = await prisma.systemConfig.findUnique({
    where: { key: `question_game_custom_${teacherId}` },
  });
  if (!gamesConfig) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  const games: Omit<AnyGame, "isBuiltIn" | "teacherId">[] = (() => {
    try { return JSON.parse(gamesConfig.value); } catch { return []; }
  })();

  const idx = games.findIndex((g) => g.id === gameId);
  if (idx === -1) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  games[idx] = { ...games[idx], ...body };

  await prisma.systemConfig.update({
    where: { key: `question_game_custom_${teacherId}` },
    data: { value: JSON.stringify(games) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;
  const gameId = params.id;

  const gamesConfig = await prisma.systemConfig.findUnique({
    where: { key: `question_game_custom_${teacherId}` },
  });
  if (!gamesConfig) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  const games: Omit<AnyGame, "isBuiltIn" | "teacherId">[] = (() => {
    try { return JSON.parse(gamesConfig.value); } catch { return []; }
  })();

  const filtered = games.filter((g) => g.id !== gameId);
  await prisma.systemConfig.update({
    where: { key: `question_game_custom_${teacherId}` },
    data: { value: JSON.stringify(filtered) },
  });

  // visibility 설정도 정리
  const visConfig = await prisma.systemConfig.findUnique({
    where: { key: `question_game_vis_${teacherId}` },
  });
  if (visConfig) {
    const visMap: Record<string, GameVisibility> = (() => {
      try { return JSON.parse(visConfig.value); } catch { return {}; }
    })();
    delete visMap[gameId];
    await prisma.systemConfig.update({
      where: { key: `question_game_vis_${teacherId}` },
      data: { value: JSON.stringify(visMap) },
    });
  }

  return NextResponse.json({ ok: true });
}
