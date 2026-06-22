import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canPatchQuestion } from "@/lib/questions";
import { cleanupQuestionTranslations } from "@/lib/translation-cleanup";
import { z } from "zod";

const patchQuestionSchema = z.object({
  closure: z.enum(["closed", "open"]).optional(),
  cognitive: z.enum(["factual", "conceptual", "controversial"]).optional(),
  isPublic: z.boolean().optional(),
  flagged: z.boolean().optional(),
});

async function canTeacherManageQuestion(teacherId: string, questionId: string) {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: {
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      author: {
        select: {
          role: true,
          school: true,
          grade: true,
          className: true,
        },
      },
    },
  });

  if (!teacher || !question || question.author.role !== "STUDENT") return false;

  if (teacher.teacherClasses.length > 0) {
    return Boolean(teacher.school && teacher.school === question.author.school) && teacher.teacherClasses.some(
      (teacherClass) =>
        teacherClass.grade === question.author.grade &&
        teacherClass.className === question.author.className,
    );
  }

  return Boolean(teacher.school && teacher.school === question.author.school);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const question = await prisma.question.findUnique({
    where: { id: params.id },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          className: true,
        },
      },
      comments: {
        include: {
          author: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }

  const userRole = (session.user as { id: string; role?: string }).role;
  const userId = (session.user as { id: string; role?: string }).id;

  // 비공개 질문은 작성자 본인 또는 담당 학급 교사만 열람 가능(아무 교사나 X)
  if (
    !question.isPublic &&
    question.authorId !== userId &&
    !(userRole === "TEACHER" && (await canTeacherManageQuestion(userId, params.id)))
  ) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
  }

  return NextResponse.json(question);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string; role?: string }).id;
  const userRole = (session.user as { id: string; role?: string }).role;

  try {
    const body = await req.json();
    const data = patchQuestionSchema.parse(body);
    const { closure, cognitive, isPublic } = data;

    const patchedFields = Object.keys(data).filter((k) =>
      ["closure", "cognitive", "isPublic", "flagged"].includes(k)
    );

    const existing = await prisma.question.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
    }

    if (!canPatchQuestion(userRole, userId, existing.authorId, patchedFields)) {
      return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
    }

    if (userRole === "TEACHER" && !(await canTeacherManageQuestion(userId, params.id))) {
      return NextResponse.json({ error: "수정 권한이 없습니다" }, { status: 403 });
    }

    const question = await prisma.question.update({
      where: { id: params.id },
      data: {
        ...(closure !== undefined && { closure }),
        ...(cognitive !== undefined && { cognitive }),
        ...(isPublic !== undefined && { isPublic }),
        ...(data.flagged !== undefined && { flagged: data.flagged }),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            className: true,
          },
        },
      },
    });

    return NextResponse.json(question);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Update question error:", error);
    return NextResponse.json({ error: "질문을 찾을 수 없거나 수정에 실패했습니다" }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string; role?: string }).id;
  const userRole = (session.user as { id: string; role?: string }).role;

  const question = await prisma.question.findUnique({
    where: { id: params.id },
  });

  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }

  if (question.authorId !== userId && userRole !== "TEACHER") {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  // 교사는 담당 학급 질문만 삭제 가능(수정 권한 검사와 동일)
  if (userRole === "TEACHER" && !(await canTeacherManageQuestion(userId, params.id))) {
    return NextResponse.json({ error: "삭제 권한이 없습니다" }, { status: 403 });
  }

  // 번역 캐시 정리(삭제 전 호출 — 댓글 id 확보)
  await cleanupQuestionTranslations([params.id]);

  // 댓글(외래키 Restrict)·좋아요·관련 PointLog까지 함께 정리
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { questionId: params.id } }),
    prisma.questionLike.deleteMany({ where: { questionId: params.id } }),
    prisma.pointLog.deleteMany({ where: { relatedQuestionId: params.id } }),
    prisma.question.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ success: true });
}
