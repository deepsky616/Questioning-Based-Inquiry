import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteTeacherAccountData } from "@/lib/account-deletion";
import { logger } from "@/lib/logger";

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const user = session.user as { id?: string; role?: string };
  if (!user.id) return NextResponse.json({ error: "사용자 정보를 찾을 수 없습니다" }, { status: 401 });

  if (user.role === "STUDENT") {
    return NextResponse.json(
      { error: "학생 탈퇴는 학급담당 선생님에게 문의해 주시기 바랍니다." },
      { status: 403 },
    );
  }

  if (user.role !== "TEACHER") {
    return NextResponse.json({ error: "탈퇴할 수 없는 계정 유형입니다" }, { status: 403 });
  }

  try {
    await prisma.$transaction((tx) => deleteTeacherAccountData(tx, user.id!), {
      timeout: 20_000,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("Account deletion error:", error);
    return NextResponse.json({ error: "회원 탈퇴 처리 중 오류가 발생했습니다" }, { status: 500 });
  }
}
