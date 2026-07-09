import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GameVisibility } from "@/lib/question-games-data";
import {
  deleteQuestionGame,
  saveQuestionGameVisibility,
  updateQuestionGame,
} from "@/lib/question-game-settings-store";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
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
    await saveQuestionGameVisibility(teacherId, gameId, newVisibility);
    return NextResponse.json({ ok: true });
  }

  // 커스텀 게임 정보 수정
  const updated = await updateQuestionGame(teacherId, gameId, body);
  if (!updated) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;
  const gameId = params.id;

  const deleted = await deleteQuestionGame(teacherId, gameId);
  if (!deleted) {
    return NextResponse.json({ error: "게임을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
