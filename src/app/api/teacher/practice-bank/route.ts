import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { practiceCustomItemSchema } from "@/lib/practice-custom";

// 교사 커스텀 연습 문항 관리 — 본인 문항만 조회·추가한다.
// 저장 즉시 담당 학급 학생의 연습(/api/practice/bank)에 병합된다.

const MAX_ITEMS_PER_TEACHER = 200;

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

export async function GET() {
  const guard = requireTeacher(await auth());
  if (guard.error) return guard.error;

  const items = await prisma.practiceCustomItem.findMany({
    where: { teacherId: guard.teacherId },
    orderBy: { createdAt: "desc" },
  });
  if (items.length === 0) return NextResponse.json({ items: [] });

  // 문항별 학생 풀이 통계 — 시도 기록(정답·오답 모두)으로 정답률을 계산한다
  const attempts = await prisma.practiceAttempt.findMany({
    where: { itemId: { in: items.map((item) => item.id) } },
    select: { itemId: true, studentId: true, correct: true },
  });
  const withStats = items.map((item) => {
    const itemAttempts = attempts.filter((attempt) => attempt.itemId === item.id);
    return {
      ...item,
      attemptCount: itemAttempts.length,
      correctCount: itemAttempts.filter((attempt) => attempt.correct).length,
      attemptStudents: new Set(itemAttempts.map((attempt) => attempt.studentId)).size,
    };
  });
  return NextResponse.json({ items: withStats });
}

export async function POST(req: Request) {
  const guard = requireTeacher(await auth());
  if (guard.error) return guard.error;

  try {
    const body = practiceCustomItemSchema.parse(await req.json());

    const count = await prisma.practiceCustomItem.count({ where: { teacherId: guard.teacherId } });
    if (count >= MAX_ITEMS_PER_TEACHER) {
      return NextResponse.json({ error: "문항은 교사당 최대 200개까지 만들 수 있습니다" }, { status: 400 });
    }

    // 모드에 해당하는 필드만 저장 — 나머지 컬럼은 null 유지
    const item = await prisma.practiceCustomItem.create({
      data: { teacherId: guard.teacherId, ...body },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Practice bank create error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
