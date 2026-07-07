import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { logger } from "@/lib/logger";

const schema = z.object({
  studentIds: z.array(z.string().min(1)).min(1),
  newPassword: z.string().min(1),
});

// 교사가 담당 학생(개별 또는 여러 명)의 로그인 비밀번호를 재설정한다.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  try {
    const { studentIds, newPassword } = schema.parse(await req.json());

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });

    const teacher = await prisma.user.findUnique({
      where: { id: teacherId },
      select: { school: true, teacherClasses: { select: { grade: true, className: true } } },
    });
    if (!teacher?.school) {
      return NextResponse.json({ error: "담당 학교 정보가 없습니다" }, { status: 400 });
    }

    // 담당 범위 내 학생만 (학교 + 담당 학급)
    const classes = teacher.teacherClasses;
    const scope = {
      role: "STUDENT" as const,
      school: teacher.school,
      id: { in: studentIds },
      ...(classes.length > 0
        ? { OR: classes.map((c) => ({ grade: c.grade, className: c.className })) }
        : {}),
    };
    const inScope = await prisma.user.findMany({ where: scope, select: { id: true } });

    if (inScope.length !== studentIds.length) {
      return NextResponse.json({ error: "담당 학생이 아닌 계정이 포함돼 있습니다" }, { status: 403 });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.updateMany({
      where: { id: { in: inScope.map((s) => s.id) } },
      data: { password: hashed },
    });

    return NextResponse.json({ ok: true, count: inScope.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Student password reset error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
