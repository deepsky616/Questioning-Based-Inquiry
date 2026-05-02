import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  subject: z.string().min(1).optional(),
  topic: z.string().optional(),
  sharedQuestions: z
    .array(z.object({ type: z.string(), content: z.string() }))
    .optional(),
  defaultQuestionPublic: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "TEACHER") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const teacherId = (session.user as any).id as string;
    const existing = await prisma.questionSession.findUnique({ where: { id } });
    if (!existing || existing.teacherId !== teacherId) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    const body = await req.json();
    const data = updateSchema.parse(body);
    const updated = await prisma.questionSession.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "TEACHER") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const teacherId = (session.user as any).id as string;
    const existing = await prisma.questionSession.findUnique({ where: { id } });
    if (!existing || existing.teacherId !== teacherId) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    await prisma.questionSession.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
