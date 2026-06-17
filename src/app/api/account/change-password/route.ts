import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "새 비밀번호는 6자 이상이어야 합니다"),
});

// 로그인한 본인의 비밀번호 변경: 현재 비밀번호 확인 후 새 비밀번호로 저장
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  try {
    const { currentPassword, newPassword } = schema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user) return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다" }, { status: 400 });

    if (await bcrypt.compare(newPassword, user.password)) {
      return NextResponse.json({ error: "새 비밀번호가 현재 비밀번호와 같습니다" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });

    return NextResponse.json({ message: "비밀번호가 변경되었습니다" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Change password error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
