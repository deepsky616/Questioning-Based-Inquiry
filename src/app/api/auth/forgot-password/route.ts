import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isEmailEnabled, sendTeacherPasswordResetEmail } from "@/lib/email";
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

    if (!isEmailEnabled()) {
      logger.error(
        "[forgot-password] email delivery is disabled: GMAIL_USER and GMAIL_APP_PASSWORD are required",
      );
      return NextResponse.json({ message: GENERIC_MESSAGE });
    }

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

    // 기존 링크는 새 메일이 실제로 접수된 뒤에만 무효화한다. 전송 장애가
    // 기존의 유효한 복구 수단까지 없애지 않도록 새 토큰을 먼저 따로 만든다.
    const resetToken = await prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: teacher.id,
        // SMTP가 메일을 접수하기 전에는 링크가 사용되지 않도록 만료 상태로 둔다.
        expiresAt: new Date(0),
      },
    });

    const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
    const resetUrl = buildPasswordResetUrl(origin, token);
    const emailResult = await sendTeacherPasswordResetEmail({
      to: teacher.email!,
      name: teacher.name,
      resetUrl,
    });

    logger.info("[forgot-password] emailResult:", emailResult);
    const emailDelivered = emailResult.ok && !emailResult.skipped;
    if (!emailDelivered) {
      const reason = emailResult.ok
        ? ("reason" in emailResult ? emailResult.reason : "Email delivery was skipped")
        : emailResult.error;
      logger.error("Password reset email delivery failed:", reason);

      try {
        await prisma.passwordResetToken.delete({ where: { id: resetToken.id } });
      } catch (cleanupError) {
        logger.error("Password reset token cleanup error:", cleanupError);
      }

      return NextResponse.json({ message: GENERIC_MESSAGE });
    }

    // 전송에 성공한 현재 토큰만 활성화한다. 아직 전송 중인 다른 요청의 만료
    // 상태 토큰은 건드리지 않아 동시 요청끼리 서로 교착되거나 삭제하지 않는다.
    const activatedAt = new Date();
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: {
          userId: teacher.id,
          usedAt: null,
          expiresAt: { gt: activatedAt },
          id: { not: resetToken.id },
        },
        data: { usedAt: activatedAt },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { expiresAt, usedAt: null },
      }),
    ]);

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "올바른 이메일을 입력해 주세요" }, { status: 400 });
    }
    logger.error("Forgot password error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
