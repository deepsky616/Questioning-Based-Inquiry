import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  subject: z.string().min(1).optional(),
  topic: z.string().optional(),
  targetType: z.enum(["ALL", "CLASS", "STUDENT", "CUSTOM"]).optional(),
  targetGrade: z.string().nullable().optional(),
  targetClassName: z.string().nullable().optional(),
  targetStudentId: z.string().nullable().optional(),
  targetStudentIds: z.array(z.string()).optional(),
  unitDesignId: z.string().nullable().optional(),
  sharedQuestions: z
    .array(z.object({ type: z.string(), content: z.string() }).passthrough())
    .optional(),
  defaultQuestionPublic: z.boolean().optional(),
  likesVisibleToPeers: z.boolean().optional(),
  commentsVisibleToPeers: z.boolean().optional(),
  isActive: z.boolean().optional(),
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
    const { sharedQuestions, targetStudentIds, ...scalarData } = data;
    const updateData: Prisma.QuestionSessionUpdateInput = {
      ...scalarData,
      ...(sharedQuestions !== undefined && {
        sharedQuestions: sharedQuestions as Prisma.InputJsonValue,
      }),
      ...(targetStudentIds !== undefined && {
        targetStudentIds: targetStudentIds as Prisma.InputJsonValue,
      }),
    };
    const updated = await prisma.questionSession.update({ where: { id }, data: updateData });
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
    // 저장된 세션 AI 분석도 함께 정리(고아 행 방지)
    await prisma.sessionAnalysis.deleteMany({ where: { sessionId: id } });
    await prisma.questionSession.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
