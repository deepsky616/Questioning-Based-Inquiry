import { Prisma } from "@prisma/client";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { buildQuestionCreateData, buildQuestionWhereClause, resolveIsPublicFilter, QUESTION_LIST_MAX } from "@/lib/questions";
import { isCommentVisibleToViewer } from "@/lib/content-visibility";
import { sendQuestionNotificationEmail } from "@/lib/email";
import { normalizeContent, ACTIVITY_BASE_POINTS } from "@/lib/content-normalize";

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

export class QuestionRouteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "QuestionRouteError";
  }
}

export interface QuestionRouteUser {
  id?: string | null;
  role?: string | null;
  email?: string | null;
}

function requireUserId(user: QuestionRouteUser): string {
  if (!user.id) throw new QuestionRouteError("로그인이 필요합니다", 401);
  return user.id;
}

export async function listQuestionsForUser(req: Request, sessionUser: QuestionRouteUser) {
  const { searchParams } = new URL(req.url);
  const role = sessionUser.role ?? undefined;

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

  if (role === "TEACHER") {
    const teacherId = requireUserId(sessionUser);
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

  if (role === "STUDENT") {
    const studentId = requireUserId(sessionUser);
    const requestedSessionId = searchParams.get("sessionId");
    const requestedAuthorId = searchParams.get("authorId");

    if (requestedAuthorId !== studentId) {
      const me = await prisma.user.findUnique({
        where: { id: studentId },
        select: { school: true, grade: true, className: true },
      });
      if (me?.school && me.grade && me.className) {
        (where as Record<string, unknown>).author = {
          OR: [
            { id: studentId },
            { role: "STUDENT", school: me.school, grade: me.grade, className: me.className },
            { role: "TEACHER", school: me.school },
          ],
        };
      } else {
        (where as Record<string, unknown>).author = { id: studentId };
      }

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

  const userId = requireUserId(sessionUser);
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
    take: QUESTION_LIST_MAX,
  });

  const enriched = questions.map((q) => {
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

  return enriched;
}

export async function createQuestionForUser(req: Request, sessionUser: QuestionRouteUser) {
  const body = await req.json();
  const data = createQuestionSchema.parse(body);
  const userId = requireUserId(sessionUser);

  const selectedSession = data.sessionId
    ? await prisma.questionSession.findUnique({
        where: { id: data.sessionId },
        select: { defaultQuestionPublic: true, isActive: true },
      })
    : null;

  const userRole = sessionUser.role ?? undefined;
  if (selectedSession && !selectedSession.isActive && userRole !== "TEACHER") {
    throw new QuestionRouteError("비활성화된 세션에서는 질문을 작성할 수 없습니다", 403);
  }

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
      throw new QuestionRouteError("이미 같은 질문을 작성했어요. 다른 관점으로 바꿔보세요!", 409, "DUPLICATE");
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
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
        logger.error("Question point award failed:", e);
      }
    }

    try {
      await prisma.appNotification.updateMany({
        where: {
          recipientId: userId,
          sessionId: question.sessionId,
          type: "SESSION_REMINDER",
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    } catch (e) {
      logger.error("Session reminder completion failed:", e);
    }
  }

  if (question.session?.teacher.email && question.session.teacher.email !== sessionUser.email) {
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

  return question;
}
