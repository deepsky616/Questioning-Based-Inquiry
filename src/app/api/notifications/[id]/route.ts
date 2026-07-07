import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const { id } = await params;
  await prisma.appNotification.updateMany({
    where: { id, recipientId: userId },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
