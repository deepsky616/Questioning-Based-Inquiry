import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTeacherPasswordResetEmail } from "@/lib/email";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  getPasswordResetExpiry,
  hashPasswordResetToken,
} from "@/lib/password-reset";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = forgotPasswordSchema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();

    const teacher = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!teacher || teacher.role !== "TEACHER") {
      return NextResponse.json(
        { error: "등록되지 않은 교사 이메일입니다." },
        { status: 404 }
      );
    }

    const token = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = getPasswordResetExpiry();

    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: teacher.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: {
          tokenHash,
          userId: teacher.id,
          expiresAt,
        },
      }),
    ]);

    const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
    const resetUrl = buildPasswordResetUrl(origin, token);
    const emailResult = await sendTeacherPasswordResetEmail({
      to: teacher.email,
      name: teacher.name,
      resetUrl,
    });

    console.log("[forgot-password] emailResult:", JSON.stringify(emailResult));
    if (!emailResult.ok) {
      console.error("Password reset email error:", emailResult.error);
    }

    return NextResponse.json({ message: "비밀번호 재설정 링크를 이메일로 보냈습니다." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "올바른 이메일을 입력해 주세요" }, { status: 400 });
    }
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
