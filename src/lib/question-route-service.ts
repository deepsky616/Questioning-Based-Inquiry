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

async function applyQuestionAccessScope(
  where: Prisma.QuestionWhereInput,
  searchParams: URLSearchParams,
  sessionUser: QuestionRouteUser,
) {
  const role = sessionUser.role ?? undefined;

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
        where.author = {
          role: "STUDENT",
          OR: classes.map((item) => ({ grade: item.grade, className: item.className })),
        };
      } else if (teacher.school) {
        where.author = { role: "STUDENT", school: teacher.school };
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
        where.author = {
          OR: [
            { id: studentId },
            { role: "STUDENT", school: me.school, grade: me.grade, className: me.className },
            { role: "TEACHER", school: me.school },
          ],
        };
      } else {
        where.author = { id: studentId };
      }

      const hasDetailFilter = Boolean(
        searchParams.get("date") ||
        searchParams.get("subject") ||
        searchParams.get("topic"),
      );
      if ((!requestedSessionId || requestedSessionId === "all") && !hasDetailFilter) {
        where.session = { isActive: true };
      }
    }
  }
}

function withQuestionFilters(
  baseWhere: Prisma.QuestionWhereInput,
  filters: Prisma.QuestionWhereInput[],
): Prisma.QuestionWhereInput {
  return filters.length > 0 ? { AND: [baseWhere, ...filters] } : baseWhere;
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const teacherQuestionPageSelect = {
  id: true,
  content: true,
  closure: true,
  cognitive: true,
  closureScore: true,
  cognitiveScore: true,
  sessionId: true,
  session: { select: { id: true, date: true, subject: true, topic: true } },
  author: {
    select: { id: true, name: true, className: true, grade: true, studentNumber: true },
  },
  isPublic: true,
  flagged: true,
  flagReason: true,
  createdAt: true,
  _count: { select: { likes: true, comments: true } },
  comments: { where: { flagged: true }, select: { id: true }, take: 1 },
} satisfies Prisma.QuestionSelect;

const teacherQuestionListVisibilityFilter: Prisma.QuestionWhereInput = {
  OR: [
    { sessionId: null },
    { session: { unitDesignId: null } },
    { session: { sharedQuestions: { equals: [] } } },
  ],
};

function teacherQuestionOrderBy(
  searchParams: URLSearchParams,
): Prisma.QuestionOrderByWithRelationInput[] {
  const commentSort = searchParams.get("commentSort");
  if (commentSort === "asc" || commentSort === "desc") {
    return [{ comments: { _count: commentSort } }, { createdAt: "desc" }, { id: "desc" }];
  }
  const likeSort = searchParams.get("likeSort");
  if (likeSort === "asc" || likeSort === "desc") {
    return [{ likes: { _count: likeSort } }, { createdAt: "desc" }, { id: "desc" }];
  }
  return [{ createdAt: "desc" }, { id: "desc" }];
}

function numberSortValue(value?: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

function compareNumberSortValue(left?: string | null, right?: string | null): number {
  const leftNumber = numberSortValue(left);
  const rightNumber = numberSortValue(right);
  if (leftNumber === rightNumber) return 0;
  return leftNumber < rightNumber ? -1 : 1;
}

interface StudentSortAuthor {
  id: string;
  grade: string | null;
  className: string | null;
  studentNumber: string | null;
}

async function listTeacherQuestionRowsByStudent({
  client,
  where,
  direction,
  skip,
  take,
}: {
  client: Prisma.TransactionClient;
  where: Prisma.QuestionWhereInput;
  direction: "asc" | "desc";
  skip: number;
  take: number;
}) {
  const authorGroups = await client.question.groupBy({
    by: ["authorId"],
    where,
    _count: { _all: true },
  });
  if (authorGroups.length === 0) return [];

  const authors = await client.user.findMany({
    where: { id: { in: authorGroups.map((group) => group.authorId) } },
    select: { id: true, grade: true, className: true, studentNumber: true },
  });
  const authorById = new Map(authors.map((author) => [author.id, author]));
  const fallbackAuthor = (id: string): StudentSortAuthor => ({
    id,
    grade: null,
    className: null,
    studentNumber: null,
  });
  const multiplier = direction === "desc" ? -1 : 1;
  const orderedGroups = [...authorGroups].sort((left, right) => {
    const leftAuthor = authorById.get(left.authorId) ?? fallbackAuthor(left.authorId);
    const rightAuthor = authorById.get(right.authorId) ?? fallbackAuthor(right.authorId);
    const comparison =
      compareNumberSortValue(leftAuthor.grade, rightAuthor.grade) ||
      compareNumberSortValue(leftAuthor.className, rightAuthor.className) ||
      compareNumberSortValue(leftAuthor.studentNumber, rightAuthor.studentNumber);
    return multiplier * comparison || left.authorId.localeCompare(right.authorId);
  });

  // 학생별 질문 묶음에서 현재 페이지와 겹치는 구간만 계산한다.
  let remainingSkip = skip;
  let remainingTake = take;
  const slices: Array<{ authorId: string; count: number; skip: number; take: number }> = [];
  for (const group of orderedGroups) {
    const count = group._count._all;
    if (remainingSkip >= count) {
      remainingSkip -= count;
      continue;
    }
    const sliceTake = Math.min(remainingTake, count - remainingSkip);
    slices.push({ authorId: group.authorId, count, skip: remainingSkip, take: sliceTake });
    remainingSkip = 0;
    remainingTake -= sliceTake;
    if (remainingTake === 0) break;
  }
  if (slices.length === 0) return [];

  // 온전히 포함된 학생들은 한 번에 읽고, 페이지 경계 학생만 개별 범위로 읽는다.
  const fullSlices = slices.filter((slice) => slice.skip === 0 && slice.take === slice.count);
  const partialSlices = slices.filter((slice) => slice.skip > 0 || slice.take < slice.count);
  const rowQueries = partialSlices.map((slice) => client.question.findMany({
    where: { AND: [where, { authorId: slice.authorId }] },
    select: teacherQuestionPageSelect,
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    skip: slice.skip,
    take: slice.take,
  }));
  if (fullSlices.length > 0) {
    rowQueries.push(client.question.findMany({
      where: { AND: [where, { authorId: { in: fullSlices.map((slice) => slice.authorId) } }] },
      select: teacherQuestionPageSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: fullSlices.reduce((sum, slice) => sum + slice.take, 0),
    }));
  }

  const rows = (await Promise.all(rowQueries)).flat();
  const authorRank = new Map(orderedGroups.map((group, index) => [group.authorId, index]));
  return rows.sort((left, right) =>
    (authorRank.get(left.author.id) ?? 0) - (authorRank.get(right.author.id) ?? 0) ||
    right.createdAt.getTime() - left.createdAt.getTime() ||
    right.id.localeCompare(left.id),
  );
}

export async function getStudentDashboardQuestionSummary(sessionUser: QuestionRouteUser) {
  if (sessionUser.role !== "STUDENT") {
    throw new QuestionRouteError("학생만 조회할 수 있습니다", 403);
  }

  const studentId = requireUserId(sessionUser);
  const where = { authorId: studentId };
  const [recent, closureGroups, cognitiveGroups, answeredSessions] = await Promise.all([
    prisma.question.findMany({
      where,
      select: {
        id: true,
        content: true,
        closure: true,
        cognitive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.question.groupBy({
      by: ["closure"],
      where,
      _count: { _all: true },
    }),
    prisma.question.groupBy({
      by: ["cognitive"],
      where,
      _count: { _all: true },
    }),
    prisma.question.findMany({
      where: { authorId: studentId, sessionId: { not: null } },
      select: { sessionId: true },
      distinct: ["sessionId"],
      orderBy: { sessionId: "asc" },
    }),
  ]);

  const closureCounts = Object.fromEntries(
    closureGroups.map((group) => [group.closure, group._count._all]),
  ) as Record<string, number>;
  const cognitiveCounts = Object.fromEntries(
    cognitiveGroups.map((group) => [group.cognitive, group._count._all]),
  ) as Record<string, number>;

  return {
    recent,
    stats: {
      total: closureGroups.reduce((sum, group) => sum + group._count._all, 0),
      byClosure: {
        closed: closureCounts.closed ?? 0,
        open: closureCounts.open ?? 0,
      },
      byCognitive: {
        factual: cognitiveCounts.factual ?? 0,
        conceptual: cognitiveCounts.conceptual ?? 0,
        controversial: cognitiveCounts.controversial ?? 0,
      },
    },
    answeredSessionIds: answeredSessions
      .map((session) => session.sessionId)
      .filter((sessionId): sessionId is string => Boolean(sessionId)),
  };
}

export async function listTeacherQuestionPage(
  req: Request,
  sessionUser: QuestionRouteUser,
) {
  if (sessionUser.role !== "TEACHER") {
    throw new QuestionRouteError("교사만 조회할 수 있습니다", 403);
  }

  const { searchParams } = new URL(req.url);
  const page = positiveInteger(searchParams.get("page"), 1);
  const pageSize = Math.min(positiveInteger(searchParams.get("pageSize"), 30), 100);
  const search = searchParams.get("search")?.trim() ?? "";

  const scopedWhere = buildQuestionWhereClause({
    authorId: searchParams.get("authorId"),
    isPublic: null,
    closure: null,
    cognitive: null,
    search: null,
    sessionId: searchParams.get("sessionId"),
    date: searchParams.get("date"),
    subject: searchParams.get("subject"),
    topic: searchParams.get("topic"),
  }) as Prisma.QuestionWhereInput;
  await applyQuestionAccessScope(scopedWhere, searchParams, sessionUser);
  const summaryWhere = withQuestionFilters(scopedWhere, [teacherQuestionListVisibilityFilter]);

  const searchedWhere = withQuestionFilters(summaryWhere, search
    ? [{
        OR: [
          { content: { contains: search, mode: "insensitive" } },
          { author: { name: { contains: search, mode: "insensitive" } } },
        ],
      }]
    : []);
  const flaggedFilter: Prisma.QuestionWhereInput = {
    OR: [{ flagged: true }, { comments: { some: { flagged: true } } }],
  };
  const pageFilters: Prisma.QuestionWhereInput[] = [];
  const closure = searchParams.get("closure");
  const cognitive = searchParams.get("cognitive");
  if (closure === "closed" || closure === "open") pageFilters.push({ closure });
  if (cognitiveSchema.safeParse(cognitive).success) {
    pageFilters.push({ cognitive: cognitive as z.infer<typeof cognitiveSchema> });
  }
  if (searchParams.get("flagged") === "1" || searchParams.get("flagged") === "true") {
    pageFilters.push(flaggedFilter);
  }
  const pageWhere = withQuestionFilters(searchedWhere, pageFilters);
  const studentSort = searchParams.get("studentSort");
  const skip = (page - 1) * pageSize;

  const pageRowsPromise = studentSort === "asc" || studentSort === "desc"
    ? prisma.$transaction(
        (client) => listTeacherQuestionRowsByStudent({
          client,
          where: pageWhere,
          direction: studentSort,
          skip,
          take: pageSize,
        }),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      )
    : prisma.question.findMany({
        where: pageWhere,
        select: teacherQuestionPageSelect,
        orderBy: teacherQuestionOrderBy(searchParams),
        skip,
        take: pageSize,
      });

  const [pageRows, total, closureGroups, cognitiveGroups, flagged] = await Promise.all([
    pageRowsPromise,
    prisma.question.count({ where: pageWhere }),
    prisma.question.groupBy({
      by: ["closure"],
      where: searchedWhere,
      _count: { _all: true },
    }),
    prisma.question.groupBy({
      by: ["cognitive"],
      where: searchedWhere,
      _count: { _all: true },
    }),
    prisma.question.count({ where: withQuestionFilters(searchedWhere, [flaggedFilter]) }),
  ]);

  const closureCounts = Object.fromEntries(
    closureGroups.map((group) => [group.closure, group._count._all]),
  ) as Record<string, number>;
  const cognitiveCounts = Object.fromEntries(
    cognitiveGroups.map((group) => [group.cognitive, group._count._all]),
  ) as Record<string, number>;
  const summaryTotal = closureGroups.reduce((sum, group) => sum + group._count._all, 0);

  return {
    items: pageRows.map(({ _count, comments, ...question }) => ({
      ...question,
      likeCount: _count.likes,
      commentCount: _count.comments,
      hasFlaggedComment: comments.length > 0,
    })),
    pageInfo: {
      page,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    },
    summary: {
      total: summaryTotal,
      closure: {
        closed: closureCounts.closed ?? 0,
        open: closureCounts.open ?? 0,
      },
      cognitive: {
        factual: cognitiveCounts.factual ?? 0,
        conceptual: cognitiveCounts.conceptual ?? 0,
        controversial: cognitiveCounts.controversial ?? 0,
      },
      flagged,
    },
  };
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

  await applyQuestionAccessScope(
    where as Prisma.QuestionWhereInput,
    searchParams,
    sessionUser,
  );

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
    throw new QuestionRouteError("비활성화된 수업에서는 질문을 작성할 수 없습니다", 403);
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
            reason: "질문수업 질문 작성",
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
