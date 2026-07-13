import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getRequestLocale } from "@/lib/locale";
import { studentCanAccessSession } from "@/lib/session-access-policy";
import { requireTeacherSession } from "@/lib/session-helpers";

const analysisResultSchema = z
  .unknown()
  .refine((value) => !!value && typeof value === "object" && !Array.isArray(value), "result는 객체여야 합니다")
  .transform((value) => value as Record<string, unknown>);

const patchBodySchema = z.object({
  sessionId: z.string().min(1),
  scope: z.enum(["class", "student"]),
  studentId: z.string().min(1).optional(),
  result: analysisResultSchema,
}).superRefine((value, ctx) => {
  if (value.scope === "student" && !value.studentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["studentId"],
      message: "studentId가 필요합니다",
    });
  }
});

// 교사가 AI 분석 결과를 직접 수정해 다시 저장한다(학급/학생 공용). 교사 전용.
// PATCH body: { sessionId, scope: "class" | "student", studentId?, result: {...} }
export async function PATCH(req: NextRequest) {
  const authResult = requireTeacherSession(await auth());
  if (!authResult.ok) return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  const userId = authResult.user.id;

  const parsed = patchBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  const { sessionId, scope, result } = parsed.data;
  const studentId = scope === "student" ? parsed.data.studentId ?? "" : "";

  // 세션이 이 교사 소유인지 확인
  const owned = await prisma.questionSession.findUnique({
    where: { id: sessionId },
    select: {
      teacherId: true,
      targetType: true,
      targetGrade: true,
      targetClassName: true,
      targetStudentId: true,
      targetStudentIds: true,
      teacher: {
        select: {
          school: true,
          teacherClasses: { select: { grade: true, className: true } },
        },
      },
    },
  });
  if (!owned || owned.teacherId !== userId) return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });

  if (scope === "student") {
    const targetStudent = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        role: true,
        school: true,
        grade: true,
        className: true,
      },
    });
    if (
      !targetStudent ||
      !studentCanAccessSession(owned, {
        id: targetStudent.id,
        role: targetStudent.role ?? "",
        school: targetStudent.school,
        grade: targetStudent.grade,
        className: targetStudent.className,
      })
    ) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
  }

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
