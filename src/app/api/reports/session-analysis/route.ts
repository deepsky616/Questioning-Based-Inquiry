import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRequestLocale } from "@/lib/locale";

// 교사가 AI 분석 결과를 직접 수정해 다시 저장한다(학급/학생 공용). 교사 전용.
// PATCH body: { sessionId, scope: "class" | "student", studentId?, result: {...} }
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id: string }).id;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 수정할 수 있습니다" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const scope = body.scope === "class" || body.scope === "student" ? body.scope : "";
  const studentId = scope === "student" && typeof body.studentId === "string" ? body.studentId : "";
  const result = body.result && typeof body.result === "object" ? body.result : null;
  if (!sessionId || !scope || !result) return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  if (scope === "student" && !studentId) return NextResponse.json({ error: "studentId가 필요합니다" }, { status: 400 });

  // 세션이 이 교사 소유인지 확인
  const owned = await prisma.questionSession.findUnique({ where: { id: sessionId }, select: { teacherId: true } });
  if (!owned || owned.teacherId !== userId) return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });

  const stored = result as Prisma.InputJsonValue;
  try {
    await prisma.sessionAnalysis.upsert({
      where: { sessionId_scope_studentId: { sessionId, scope, studentId } },
      create: { sessionId, scope, studentId, result: stored, locale: getRequestLocale(req) },
      update: { result: stored, locale: getRequestLocale(req) },
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    logger.error("session analysis edit error:", e);
    return NextResponse.json({ error: "저장에 실패했습니다" }, { status: 500 });
  }
}
