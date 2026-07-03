import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { buildQuestionCreateData, buildQuestionWhereClause, resolveIsPublicFilter } from "@/lib/questions";
import { isCommentVisibleToViewer } from "@/lib/content-visibility";
import { sendQuestionNotificationEmail } from "@/lib/email";
import { normalizeContent, ACTIVITY_BASE_POINTS } from "@/lib/content-normalize";
import { Prisma } from "@prisma/client";

const closureSchema = z.enum(["closed", "open"]);
const cognitiveSchema = z.enum(["factual", "conceptual", "controversial"]);

const createQuestionSchema = z.object({
  content: z.string().min(1).max(200),
  context: z.string().optional(),
  isPublic: z.boolean().optional(),
  closure: closureSchema.optional(),
  cognitive: cognitiveSchema.optional(),
  closureScore: z.number().min(0).max(1).optional(),
  cognitiveScore: z.number().min(0).max(1).optional(),
  sessionId: z.string().optional(),
  flagged: z.boolean().optional(),
  flagReason: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const role = (session.user as { role?: string }).role;

  const where = buildQuestionWhereClause({
    authorId: searchParams.get("authorId"),
    isPublic: resolveIsPublicFilter(role, searchParams.get("isPublic")),
    closure: searchParams.get("closure"),
    cognitive: searchParams.get("cognitive"),
    search: searchParams.get("search"),
    sessionId: searchParams.get("sessionId"),
    date: searchParams.get("date"),
    subject: searchParams.get("subject"),
    topic: searchParams.get("topic"),
  });

  // 교사: 담당 학년·반 학생 질문만 조회
  if (role === "TEACHER") {
    const teacherId = (session.user as { id: string }).id;
    const teacher = await prisma.user.findUnique({
      where: { id: teacherId },
      select: {
        school: true,
        teacherClasses: { select: { grade: true, className: true } },
      },
    });
    if (teacher) {
      const classes = teacher.teacherClasses;
      if (classes.length > 0) {
        (where as Record<string, unknown>).author = {
          role: "STUDENT",
          OR: classes.map((c) => ({ grade: c.grade, className: c.className })),
        };
      } else if (teacher.school) {
        (where as Record<string, unknown>).author = {
          role: "STUDENT",
          school: teacher.school,
        };
      }
    }
  }

  // 학생: 본인의 작성 질문이 아니라면 같은 학교+학년+반 학생 질문만 조회
  if (role === "STUDENT") {
    const studentId = (session.user as { id: string }).id;
    const requestedSessionId = searchParams.get("sessionId");
    const requestedAuthorId = searchParams.get("authorId");

    // 본인 질문 조회(authorId=본인)는 그대로 통과
    if (requestedAuthorId !== studentId) {
      const me = await prisma.user.findUnique({
        where: { id: studentId },
        select: { school: true, grade: true, className: true },
      });
      if (me?.school && me.grade && me.className) {
        (where as Record<string, unknown>).author = {
          OR: [
            { id: studentId }, // 본인 질문은 항상 보임
            { role: "STUDENT", school: me.school, grade: me.grade, className: me.className },
            { role: "TEACHER", school: me.school }, // 같은 학교 교사가 배포한 질문(TEACHER_SHARED)
          ],
        };
      } else {
        // 학교/학년/반 미설정이면 본인 질문만
        (where as Record<string, unknown>).author = { id: studentId };
      }

      // "전체 세션" 선택 시: 활성화된 세션의 질문만 노출
      // 단, 날짜/교과/주제 필터를 명시적으로 건 경우엔 전체 세션(활성/비활성 무관) 검색
      // - 특정 sessionId가 지정된 경우엔 그 세션 그대로
      const hasDetailFilter = !!(
        searchParams.get("date") ||
        searchParams.get("subject") ||
        searchParams.get("topic")
      );
      if ((!requestedSessionId || requestedSessionId === "all") && !hasDetailFilter) {
        (where as Record<string, unknown>).session = { isActive: true };
      }
    }
  }

  const userId = session.user.id;
  const likeSortParam = searchParams.get("likeSort") as "asc" | "desc" | null;
  const commentSortParam = searchParams.get("commentSort") as "asc" | "desc" | null;
  const studentSortParam = searchParams.get("studentSort") as "asc" | "desc" | null;

  const questions = await prisma.question.findMany({
    where,
    include: {
      author: {
        select: { id: true, name: true, className: true, grade: true, studentNumber: true },
      },
      session: {
        select: { id: true, date: true, subject: true, topic: true, likesVisibleToPeers: true, commentsVisibleToPeers: true },
      },
      comments: {
        include: {
          author: { select: { id: true, name: true, role: true } },
        },
      },
      likes: {
        select: {
          userId: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const enriched = questions.map((q) => {
    // 댓글 비공개 세션: 학생 뷰어에겐 본인·교사 댓글만 노출(토글 안내 "끄면 본인·선생님 댓글만"과 일치)
    const commentsVisible = q.session?.commentsVisibleToPeers ?? true;
    const visibleComments = q.comments.filter((c) =>
      isCommentVisibleToViewer({
        viewerRole: role ?? "",
        viewerId: userId,
        commentsVisibleToPeers: commentsVisible,
        commentAuthorId: c.author.id,
        commentAuthorRole: c.author.role,
        questionAuthorId: q.authorId,
      }),
    );
    return {
      ...q,
      comments: visibleComments.map(({ author, ...c }) => ({ ...c, author: { id: author.id, name: author.name } })),
      likeCount: q.likes.length,
      commentCount: visibleComments.length,
      likesVisibleToPeers: q.session?.likesVisibleToPeers ?? true,
      commentsVisibleToPeers: commentsVisible,
      myLike: q.likes.some((l) => l.userId === userId),
      likedBy: role === "TEACHER"
        ? q.likes.map((l) => ({ id: l.user.id, name: l.user.name }))
        : undefined,
      likes: undefined,
    };
  });

  // 정렬 기준은 학생순·좋아요순·댓글순 중 하나만 적용한다(클라이언트가 단일 기준 전송).
  if (studentSortParam) {
    const num = (v?: string | null) => {
      const n = parseInt(v ?? "", 10);
      return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
    };
    const cmp = (a: typeof enriched[number], b: typeof enriched[number]) =>
      num(a.author.grade) - num(b.author.grade) ||
      num(a.author.className) - num(b.author.className) ||
      num(a.author.studentNumber) - num(b.author.studentNumber);
    enriched.sort((a, b) => (studentSortParam === "desc" ? -cmp(a, b) : cmp(a, b)));
  } else if (commentSortParam === "desc") {
    enriched.sort((a, b) => b.commentCount - a.commentCount);
  } else if (commentSortParam === "asc") {
    enriched.sort((a, b) => a.commentCount - b.commentCount);
  } else if (likeSortParam === "desc") {
    enriched.sort((a, b) => b.likeCount - a.likeCount);
  } else if (likeSortParam === "asc") {
    enriched.sort((a, b) => a.likeCount - b.likeCount);
  }

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = createQuestionSchema.parse(body);
    const userId = (session.user as { id: string }).id;

    const selectedSession = data.sessionId
      ? await prisma.questionSession.findUnique({
          where: { id: data.sessionId },
          select: { defaultQuestionPublic: true, isActive: true },
        })
      : null;

    const userRole = (session.user as { role?: string }).role;
    if (selectedSession && !selectedSession.isActive && userRole !== "TEACHER") {
      return NextResponse.json({ error: "비활성화된 세션에서는 질문을 작성할 수 없습니다" }, { status: 403 });
    }

    // 중복 검사 (학생 + 같은 세션 + 정규화 동일)
    const normalized = normalizeContent(data.content);
    if (userRole === "STUDENT" && data.sessionId && normalized.length > 0) {
      const existing = await prisma.question.findFirst({
        where: {
          sessionId: data.sessionId,
          authorId: userId,
          normalizedContent: normalized,
        },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: "이미 같은 질문을 작성했어요. 다른 관점으로 바꿔보세요!", code: "DUPLICATE" },
          { status: 409 }
        );
      }
    }

    const createData: Prisma.QuestionUncheckedCreateInput = {
      ...buildQuestionCreateData(data, userId, {
        defaultIsPublic: selectedSession?.defaultQuestionPublic ?? false,
      }),
      normalizedContent: normalized,
      flagged: data.flagged ?? false,
      flagReason: data.flagReason || null,
    };

    const question = await prisma.question.create({
      data: createData,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            className: true,
          },
        },
        session: {
          include: {
            teacher: {
              select: {
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // 학생이 수업세션에 질문 작성 시 자동 기본 점수 (멱등)
    if (userRole === "STUDENT" && question.sessionId && question.source !== "TEACHER_SHARED") {
      try {
        await prisma.$transaction([
          prisma.pointLog.create({
            data: {
              studentId: userId,
              gameId: "ACTIVITY",
              bonusType: "QUESTION_WRITE",
              points: ACTIVITY_BASE_POINTS.QUESTION_WRITE,
              reason: "수업세션 질문 작성",
              status: "APPROVED",
              sessionId: question.sessionId,
              relatedQuestionId: question.id,
            },
          }),
          prisma.user.update({
            where: { id: userId },
            data: { totalPoints: { increment: ACTIVITY_BASE_POINTS.QUESTION_WRITE } },
          }),
        ]);
      } catch (e) {
        // P2002 멱등 위반은 무시 (이미 점수 부여됨)
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
          logger.error("Question point award failed:", e);
        }
      }
    }

    if (question.session?.teacher.email && question.session.teacher.email !== session.user.email) {
      const sessionTitle = [question.session.subject, question.session.topic].filter(Boolean).join(" - ");
      const emailResult = await sendQuestionNotificationEmail({
        to: question.session.teacher.email,
        teacherName: question.session.teacher.name,
        studentName: question.author.name,
        sessionTitle: sessionTitle || question.session.date,
        question: question.content,
      });
      if (!emailResult.ok) {
        logger.error("Question notification email error:", emailResult.error);
      }
    }

    return NextResponse.json(question);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Create question error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
