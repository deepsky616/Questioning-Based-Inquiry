import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateBulkFeedback } from "@/lib/questions";
import {
  loadTeacherStudentScope,
  studentWhereForTeacherScope,
} from "@/lib/teacher-student-access";

const schema = z.object({
  questionIds: z.array(z.string()).min(1),
  content: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 일괄 피드백을 작성할 수 있습니다" }, { status: 403 });
  }

  const userId = (session.user as { id: string }).id;

  try {
    const body = await req.json();
    const { questionIds, content } = schema.parse(body);

    const validationError = validateBulkFeedback(questionIds, content);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const teacherScope = await loadTeacherStudentScope(userId);
    if (!teacherScope) {
      return NextResponse.json({ error: "질문 접근 권한이 없습니다" }, { status: 403 });
    }

    // 담당 범위 안에 존재하는 질문 ID만 필터링
    const existingQuestions = await prisma.question.findMany({
      where: {
        id: { in: questionIds },
        author: studentWhereForTeacherScope(teacherScope),
      },
      select: { id: true },
    });
    const validIds = existingQuestions.map((q) => q.id);
    if (validIds.length === 0) {
      return NextResponse.json({ error: "질문 접근 권한이 없습니다" }, { status: 403 });
    }

    // 단일 트랜잭션으로 모든 댓글 동시 생성
    const comments = await prisma.$transaction(
      validIds.map((questionId) =>
        prisma.comment.create({
          data: { content: content.trim(), authorId: userId, questionId },
        })
      )
    );

    return NextResponse.json({
      success: comments.length,
      failed: questionIds.length - validIds.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Bulk comment error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
