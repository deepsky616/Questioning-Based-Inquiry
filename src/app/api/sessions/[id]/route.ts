import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireTeacherSession } from "@/lib/session-helpers";
import { isValidSessionDateString } from "@/lib/sessions";
import { z } from "zod";

const sessionDateSchema = z.string().trim().refine(isValidSessionDateString);

const updateSchema = z.object({
  date: sessionDateSchema.optional(),
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
  const authResult = requireTeacherSession(await auth());
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  try {
    const { id } = await params;
    const existing = await prisma.questionSession.findUnique({ where: { id } });
    if (!existing || existing.teacherId !== authResult.user.id) {
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
    const updated = data.isActive === false
      ? await prisma.$transaction(async (tx) => {
          const nextSession = await tx.questionSession.update({
            where: { id },
            data: updateData,
          });
          await tx.appNotification.updateMany({
            where: { sessionId: id, type: "SESSION_REMINDER" },
            data: { href: null },
          });
          await tx.appNotification.updateMany({
            where: { sessionId: id, type: "SESSION_REMINDER", readAt: null },
            data: { readAt: new Date() },
          });
          return nextSession;
        })
      : await prisma.questionSession.update({ where: { id }, data: updateData });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = requireTeacherSession(await auth());
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  try {
    const { id } = await params;
    const existing = await prisma.questionSession.findUnique({ where: { id } });
    if (!existing || existing.teacherId !== authResult.user.id) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.appNotification.deleteMany({
        where: { sessionId: id, type: "SESSION_REMINDER" },
      });
      await tx.sessionAnalysis.deleteMany({ where: { sessionId: id } });
      await tx.questionSession.delete({ where: { id } });
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
