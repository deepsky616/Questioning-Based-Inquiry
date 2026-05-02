import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subject: z.string().min(1),
  topic: z.string().default(""),
  defaultQuestionPublic: z.boolean().optional().default(true),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as { id: string; role?: string; grade?: string; className?: string };

  if (user.role === "TEACHER") {
    const sessions = await prisma.questionSession.findMany({
      where: { teacherId: user.id },
      orderBy: { date: "desc" },
      include: { teacher: { select: { name: true } } },
    });
    return NextResponse.json(sessions);
  }

  // 학생: 같은 학년·반을 담당하는 교사의 세션만 반환
  if (!user.grade || !user.className) {
    return NextResponse.json([]);
  }

  const teacherClasses = await prisma.teacherClass.findMany({
    where: { grade: user.grade, className: user.className },
    select: { teacherId: true },
  });

  if (teacherClasses.length === 0) {
    return NextResponse.json([]);
  }

  const teacherIds = teacherClasses.map((tc) => tc.teacherId);
  const sessions = await prisma.questionSession.findMany({
    where: { teacherId: { in: teacherIds } },
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
    const { date, subject, topic, defaultQuestionPublic } = createSchema.parse(body);

    const teacherId = (session.user as any).id as string;
    const newSession = await prisma.questionSession.create({
      data: { date, subject, topic, teacherId, defaultQuestionPublic },
    });
    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
