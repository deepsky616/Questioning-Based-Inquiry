import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPasswordResetToken } from "@/lib/password-reset";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { checkRateLimit, getClientIp } from "@/lib/api-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(1),
});

class PasswordResetTokenClaimError extends Error {}

export async function POST(req: Request) {
  // 레이트 리밋: IP당 분당 10회 (토큰 무차별 대입 방지)
  const limited = checkRateLimit(`reset-password:ip:${getClientIp(req)}`, 10);
  if (limited) return limited;

  try {
    const body = await req.json();
    const { token, password } = resetPasswordSchema.parse(body);
    const policyError = validatePasswordPolicy(password);
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }
    const tokenHash = hashPasswordResetToken(token);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, role: true } } },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt <= new Date() ||
      resetToken.user.role !== "TEACHER"
    ) {
      return NextResponse.json({ error: "유효하지 않거나 만료된 링크입니다" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const usedAt = new Date();

    try {
      await prisma.$transaction(async (tx) => {
        // 조회와 변경 사이에 같은 링크가 동시에 제출될 수 있으므로, 조건부
        // 갱신으로 토큰을 먼저 선점한다. 한 요청만 count 1을 받을 수 있다.
        const claim = await tx.passwordResetToken.updateMany({
          where: {
            id: resetToken.id,
            userId: resetToken.userId,
            usedAt: null,
            expiresAt: { gt: usedAt },
          },
          data: { usedAt },
        });

        if (claim.count !== 1) {
          throw new PasswordResetTokenClaimError();
        }

        await tx.user.update({
          where: { id: resetToken.userId },
          data: { password: hashedPassword },
        });

        await tx.passwordResetToken.updateMany({
          where: {
            userId: resetToken.userId,
            usedAt: null,
            id: { not: resetToken.id },
          },
          data: { usedAt },
        });
      });
    } catch (error) {
      if (error instanceof PasswordResetTokenClaimError) {
        return NextResponse.json(
          { error: "유효하지 않거나 만료된 링크입니다" },
          { status: 400 },
        );
      }
      throw error;
    }

    return NextResponse.json({ message: "비밀번호가 변경되었습니다" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Reset password error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
