import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canCommentOnQuestion, isCommentVisibleToViewer } from "@/lib/content-visibility";
import { ACTIVITY_BASE_POINTS } from "@/lib/content-normalize";
import { normalizeContentForPersistence } from "@/lib/content-normalize-db";
import { checkProfanity } from "@/lib/profanity";
import { Prisma } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

class InactiveCommentSessionError extends Error {}
class CommentAccessChangedError extends Error {}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userId = (session.user as { id: string; role?: string }).id;
  const [viewer, question] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        school: true,
        grade: true,
        className: true,
        teacherClasses: { select: { grade: true, className: true } },
      },
    }),
    prisma.question.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, role: true, school: true, grade: true, className: true } },
        session: {
          select: {
            id: true,
            isActive: true,
            commentsVisibleToPeers: true,
            teacherId: true,
            targetType: true,
            targetGrade: true,
            targetClassName: true,
            targetStudentId: true,
            targetStudentIds: true,
            teacher: {
              select: {
                role: true,
                school: true,
                teacherClasses: { select: { grade: true, className: true } },
              },
            },
          },
        },
      },
    }),
  ]);
  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }

  if (!canCommentOnQuestion(viewer, question)) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
  }

  const peersVisible = question.session?.commentsVisibleToPeers ?? true;
  const comments = await prisma.comment.findMany({
    where: { questionId: id },
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    comments
      .filter((comment) =>
        isCommentVisibleToViewer({
          viewerRole: viewer?.role ?? "",
          viewerId: userId,
          commentsVisibleToPeers: peersVisible,
          commentAuthorId: comment.author.id,
          commentAuthorRole: comment.author.role,
          questionAuthorId: question.authorId,
        }),
      )
      .map(({ author, ...comment }) => ({ ...comment, author: { id: author.id, name: author.name } })),
  );
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userId = (session.user as { id: string; role?: string }).id;

  try {
    const { content } = await req.json();
    if (typeof content === "string" && content.trim().length > 300) {
      return NextResponse.json({ error: "댓글은 300자 이내로 작성해 주세요" }, { status: 400 });
    }
    if (!content?.trim()) {
      return NextResponse.json({ error: "댓글 내용을 입력해 주세요" }, { status: 400 });
    }

    const [viewer, question] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          school: true,
          grade: true,
          className: true,
          teacherClasses: { select: { grade: true, className: true } },
        },
      }),
      prisma.question.findUnique({
        where: { id },
        include: {
          author: { select: { role: true, school: true, grade: true, className: true } },
          session: {
            select: {
              isActive: true,
              teacherId: true,
              targetType: true,
              targetGrade: true,
              targetClassName: true,
              targetStudentId: true,
              targetStudentIds: true,
              teacher: {
                select: {
                  role: true,
                  school: true,
                  teacherClasses: { select: { grade: true, className: true } },
                },
              },
            },
          },
        },
      }),
    ]);
    if (!question) {
      return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
    }

    if (!canCommentOnQuestion(viewer, question)) {
      return NextResponse.json({ error: "댓글 작성 권한이 없습니다" }, { status: 403 });
    }

    if (question.session && !question.session.isActive && viewer?.role !== "TEACHER") {
      return NextResponse.json({ error: "비활성화된 수업에서는 댓글을 작성할 수 없습니다" }, { status: 403 });
    }

    // 중복 검사 (학생 + 같은 질문 + 정규화 동일)
    const normalized = await normalizeContentForPersistence(content);
    if (normalized.length === 0) {
      return NextResponse.json({ error: "답변에 글자를 입력해 주세요" }, { status: 400 });
    }
    if (viewer?.role === "STUDENT" && normalized.length > 0) {
      const existing = await prisma.comment.findFirst({
        where: {
          questionId: id,
          authorId: userId,
          normalizedContent: normalized,
        },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: "이미 같은 답변을 작성했어요. 다른 표현으로 바꿔보세요!", code: "DUPLICATE" },
          { status: 409 }
        );
      }
    }

    const { flagged, reason } = checkProfanity(content.trim());
    const commentData: Prisma.CommentUncheckedCreateInput = {
      content: content.trim(),
      normalizedContent: normalized,
      authorId: userId,
      questionId: id,
      flagged,
      flagReason: reason,
    };
    const includeAuthor = { author: { select: { id: true, name: true } } } as const;
    const result = await prisma.$transaction(async (tx) => {
          const lockedQuestions = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`
              SELECT "id"
              FROM "questions"
              WHERE "id" = ${id}
              FOR SHARE
            `,
          );
          if (lockedQuestions.length === 0) throw new CommentAccessChangedError();

          let lockedQuestion = await tx.question.findUnique({
            where: { id },
            include: {
              author: { select: { role: true, school: true, grade: true, className: true } },
              session: {
                select: {
                  isActive: true,
                  teacherId: true,
                  targetType: true,
                  targetGrade: true,
                  targetClassName: true,
                  targetStudentId: true,
                  targetStudentIds: true,
                  teacher: {
                    select: {
                      role: true,
                      school: true,
                      teacherClasses: { select: { grade: true, className: true } },
                    },
                  },
                },
              },
            },
          });
          if (!lockedQuestion) throw new CommentAccessChangedError();

          if (lockedQuestion.sessionId) {
            const lockedSessions = await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT "id"
                FROM "question_sessions"
                WHERE "id" = ${lockedQuestion.sessionId}
                FOR SHARE
              `,
            );
            if (lockedSessions.length === 0) throw new CommentAccessChangedError();
            lockedQuestion = await tx.question.findUnique({
              where: { id },
              include: {
                author: { select: { role: true, school: true, grade: true, className: true } },
                session: {
                  select: {
                    isActive: true,
                    teacherId: true,
                    targetType: true,
                    targetGrade: true,
                    targetClassName: true,
                    targetStudentId: true,
                    targetStudentIds: true,
                    teacher: {
                      select: {
                        role: true,
                        school: true,
                        teacherClasses: { select: { grade: true, className: true } },
                      },
                    },
                  },
                },
              },
            });
            if (!lockedQuestion) throw new CommentAccessChangedError();
          }

          const coordinatingTeacherIds = Array.from(new Set([
            ...(lockedQuestion.session?.teacherId ? [lockedQuestion.session.teacherId] : []),
            ...(lockedQuestion.author.role === "TEACHER" ? [lockedQuestion.authorId] : []),
          ])).sort();
          if (coordinatingTeacherIds.length > 0) {
            await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT "id"
                FROM "users"
                WHERE "id" IN (${Prisma.join(coordinatingTeacherIds)})
                ORDER BY "id"
                FOR UPDATE
              `,
            );
          }
          if (lockedQuestion.session?.teacherId) {
            await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT "id"
                FROM "teacher_classes"
                WHERE "teacher_id" = ${lockedQuestion.session.teacherId}
                ORDER BY "id"
                FOR SHARE
              `,
            );
          }
          const remainingUserIds = Array.from(new Set([
            userId,
            lockedQuestion.authorId,
          ].filter((scopeUserId) => !coordinatingTeacherIds.includes(scopeUserId)))).sort();
          if (remainingUserIds.length > 0) {
            await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT "id"
                FROM "users"
                WHERE "id" IN (${Prisma.join(remainingUserIds)})
                ORDER BY "id"
                FOR UPDATE
              `,
            );
          }

          const [currentViewer, currentQuestion] = await Promise.all([
            tx.user.findUnique({
              where: { id: userId },
              select: {
                id: true,
                role: true,
                school: true,
                grade: true,
                className: true,
                teacherClasses: { select: { grade: true, className: true } },
              },
            }),
            tx.question.findUnique({
              where: { id },
              include: {
                author: { select: { role: true, school: true, grade: true, className: true } },
                session: {
                  select: {
                    isActive: true,
                    teacherId: true,
                    targetType: true,
                    targetGrade: true,
                    targetClassName: true,
                    targetStudentId: true,
                    targetStudentIds: true,
                    teacher: {
                      select: {
                        role: true,
                        school: true,
                        teacherClasses: { select: { grade: true, className: true } },
                      },
                    },
                  },
                },
              },
            }),
          ]);
          if (!currentQuestion || !canCommentOnQuestion(currentViewer, currentQuestion)) {
            throw new CommentAccessChangedError();
          }
          if (
            currentQuestion.session &&
            !currentQuestion.session.isActive &&
            currentViewer?.role !== "TEACHER"
          ) {
            throw new InactiveCommentSessionError();
          }

          const awardCurrentComment = currentViewer?.role === "STUDENT" &&
            currentQuestion.authorId !== userId &&
            (currentQuestion.author.role === "STUDENT" || currentQuestion.author.role === "TEACHER");
          const created = await tx.comment.create({ data: commentData, include: includeAuthor });
          if (awardCurrentComment) {
            await tx.pointLog.create({
              data: {
                studentId: userId,
                gameId: "ACTIVITY",
                bonusType: "COMMENT_WRITE",
                points: ACTIVITY_BASE_POINTS.COMMENT_WRITE,
                reason: "친구 질문에 답변 작성",
                status: "APPROVED",
                sessionId: currentQuestion.sessionId,
                relatedCommentId: created.id,
              },
            });
            await tx.user.update({
              where: { id: userId },
              data: { totalPoints: { increment: ACTIVITY_BASE_POINTS.COMMENT_WRITE } },
            });
          }
          return {
            comment: created,
            awardedPoints: awardCurrentComment ? ACTIVITY_BASE_POINTS.COMMENT_WRITE : 0,
          };
        });

    return NextResponse.json({
      ...result.comment,
      awardedPoints: result.awardedPoints,
    });
  } catch (error) {
    if (error instanceof CommentAccessChangedError) {
      return NextResponse.json({ error: "댓글 작성 권한이 없습니다" }, { status: 403 });
    }
    if (error instanceof InactiveCommentSessionError) {
      return NextResponse.json(
        { error: "비활성화된 수업에서는 댓글을 작성할 수 없습니다" },
        { status: 403 },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "이미 같은 답변을 작성했어요. 다른 표현으로 바꿔보세요!", code: "DUPLICATE" },
        { status: 409 },
      );
    }
    logger.error("Create comment error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
