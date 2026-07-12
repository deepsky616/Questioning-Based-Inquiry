import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { practiceCustomItemSchema } from "@/lib/practice-custom";

// 교사 커스텀 연습 문항 수정·삭제 — 본인 문항만.

type Params = { params: Promise<{ id: string }> };

const toggleSchema = z.object({ isActive: z.boolean() });

type SessionLike = { user?: { id: string; role?: string } } | null;

function requireTeacher(session: SessionLike) {
  if (!session?.user) {
    return { error: NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 }) };
  }
  if (session.user.role !== "TEACHER") {
    return { error: NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 }) };
  }
  return { teacherId: session.user.id };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = requireTeacher(await auth());
  if (guard.error) return guard.error;

  const existing = await prisma.practiceCustomItem.findFirst({
    where: { id, teacherId: guard.teacherId },
  });
  if (!existing) {
    return NextResponse.json({ error: "문항을 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const raw = await req.json();

    // 사용 여부만 바꾸는 토글
    if (typeof raw === "object" && raw !== null && Object.keys(raw).length === 1 && "isActive" in raw) {
      const { isActive } = toggleSchema.parse(raw);
      const item = await prisma.practiceCustomItem.update({ where: { id }, data: { isActive } });
      return NextResponse.json({ item });
    }

    const body = practiceCustomItemSchema.parse(raw);
    if (body.mode !== existing.mode) {
      return NextResponse.json({ error: "문항의 연습 모드는 바꿀 수 없습니다" }, { status: 400 });
    }
    const item = await prisma.practiceCustomItem.update({ where: { id }, data: body });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Practice bank update error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = requireTeacher(await auth());
  if (guard.error) return guard.error;

  const { count } = await prisma.practiceCustomItem.deleteMany({
    where: { id, teacherId: guard.teacherId },
  });
  if (count === 0) {
    return NextResponse.json({ error: "문항을 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
