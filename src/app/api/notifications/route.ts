import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sessionWhereForStudent } from "@/lib/session-access";

async function notificationRecipientWhere(
  userId: string,
  role: string | undefined,
): Promise<Prisma.AppNotificationWhereInput | null> {
  if (role !== "STUDENT") return { recipientId: userId };

  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, school: true, grade: true, className: true },
  });
  const sessionScope = student ? sessionWhereForStudent(student) : null;
  if (!sessionScope) return null;

  const sessions = await prisma.questionSession.findMany({
    where: { AND: [sessionScope, { isActive: true }] },
    select: { id: true },
  });
  return {
    recipientId: userId,
    OR: [
      { sessionId: null },
      { sessionId: { in: sessions.map((item) => item.id) } },
    ],
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { id: userId, role } = session.user as { id: string; role?: string };
  const recipientWhere = await notificationRecipientWhere(userId, role);
  if (!recipientWhere) {
    return NextResponse.json({ error: "알림을 조회할 권한이 없습니다" }, { status: 403 });
  }
  const readSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [unreadNotifications, readNotifications, unreadCount, unreadSessionReminders] = await Promise.all([
    prisma.appNotification.findMany({
      where: { ...recipientWhere, readAt: null },
      orderBy: { updatedAt: "desc" },
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
        updatedAt: true,
      },
    }),
    prisma.appNotification.findMany({
      where: {
        ...recipientWhere,
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
        updatedAt: true,
      },
    }),
    prisma.appNotification.count({
      where: { ...recipientWhere, readAt: null },
    }),
    role === "STUDENT"
      ? prisma.appNotification.findMany({
          where: {
            ...recipientWhere,
            readAt: null,
            type: "SESSION_REMINDER",
            sessionId: { not: null },
          },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            sessionId: true,
            href: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const notifications = [...unreadNotifications, ...readNotifications].slice(0, 20);
  return NextResponse.json({ notifications, unreadCount, unreadSessionReminders });
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
