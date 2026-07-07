import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const readSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [unreadNotifications, readNotifications, unreadCount] = await Promise.all([
    prisma.appNotification.findMany({
      where: { recipientId: userId, readAt: null },
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
    prisma.appNotification.findMany({
      where: {
        recipientId: userId,
        readAt: { gte: readSince },
      },
      orderBy: { readAt: "desc" },
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

  const notifications = [...unreadNotifications, ...readNotifications].slice(0, 20);
  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const result = await prisma.appNotification.updateMany({
    where: { recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
