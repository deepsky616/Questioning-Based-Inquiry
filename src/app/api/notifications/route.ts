import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const [notifications, unreadCount] = await Promise.all([
    prisma.appNotification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        href: true,
        sessionId: true,
        metadata: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.appNotification.count({
      where: { recipientId: userId, readAt: null },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const result = await prisma.appNotification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
