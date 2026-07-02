import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTeacherPasswordResetEmail } from "@/lib/email";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  getPasswordResetExpiry,
  hashPasswordResetToken,
} from "@/lib/password-reset";
import { checkRateLimit, getClientIp } from "@/lib/api-rate-limit";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

// 이메일 존재 여부를 노출하지 않는 공통 응답 (계정 열거 방지)
const GENERIC_MESSAGE =
  "입력하신 이메일이 등록되어 있다면 비밀번호 재설정 링크를 보냈습니다.";

export async function POST(req: Request) {
  // 레이트 리밋: IP당 분당 5회 (이메일 폭탄·계정 열거 시도 방지)
  const ipLimited = checkRateLimit(`forgot-password:ip:${getClientIp(req)}`, 5);
  if (ipLimited) return ipLimited;

  try {
    const body = await req.json();
    const { email } = forgotPasswordSchema.parse(body);
    const normalizedEmail = email.trim().toLowerCase();

    // 레이트 리밋: 대상 이메일당 분당 3회 (여러 IP에서 한 계정으로 몰아치는 경우)
    const emailLimited = checkRateLimit(`forgot-password:email:${normalizedEmail}`, 3);
    if (emailLimited) return emailLimited;

    const teacher = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!teacher || teacher.role !== "TEACHER") {
      // 미등록 이메일도 동일 응답: 어떤 이메일이 가입돼 있는지 노출하지 않는다
      logger.info("[forgot-password] unknown email requested");
      return NextResponse.json({ message: GENERIC_MESSAGE });
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
      to: teacher.email!,
      name: teacher.name,
      resetUrl,
    });

    logger.info("[forgot-password] emailResult:", emailResult);
    if (!emailResult.ok) {
      logger.error("Password reset email error:", emailResult.error);
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "올바른 이메일을 입력해 주세요" }, { status: 400 });
    }
    logger.error("Forgot password error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
