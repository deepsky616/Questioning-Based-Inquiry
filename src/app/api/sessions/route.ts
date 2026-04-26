import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subject: z.string().min(1),
  topic: z.string().default(""),
});

export async function GET() {
  const sessions = await prisma.questionSession.findMany({
    orderBy: { date: "desc" },
    include: { teacher: { select: { name: true } } },
  });
  return NextResponse.json(sessions);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "TEACHER") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { date, subject, topic } = createSchema.parse(body);

    const teacherId = (session.user as any).id as string;
    const newSession = await prisma.questionSession.create({
      data: { date, subject, topic, teacherId },
    });
    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
