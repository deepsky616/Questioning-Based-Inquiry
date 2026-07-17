import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cleanupQuestionTranslations } from "@/lib/translation-cleanup";
import { normalizeSharedQuestions, type SharedQuestionItem } from "@/lib/shared-questions";
import { studentCanAccessSession } from "@/lib/session-access-policy";

interface PublishItem { type?: string; content: string; publishedAt?: string }

export class PublishQuestionsError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "PublishQuestionsError";
  }
}

async function assertTeacherOwnsSession(sessionId: string, teacherId: string) {
  const qs = await prisma.questionSession.findUnique({
    where: { id: sessionId },
    select: { id: true, teacherId: true, sharedQuestions: true },
  });
  if (!qs) throw new PublishQuestionsError("질문수업을 찾을 수 없습니다", 404);
  if (qs.teacherId !== teacherId) throw new PublishQuestionsError("권한 없음", 403);
  return qs;
}

export async function getPublishedQuestions(sessionId: string, userId: string) {
  const [viewer, sessionRec] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        school: true,
        grade: true,
        className: true,
      },
    }),
    prisma.questionSession.findUnique({
      where: { id: sessionId },
      select: {
        teacherId: true,
        likesVisibleToPeers: true,
        commentsVisibleToPeers: true,
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
    }),
  ]);

  if (!sessionRec) {
    throw new PublishQuestionsError("질문수업을 찾을 수 없습니다", 404);
  }

  const canRead =
    viewer?.role === "TEACHER"
      ? sessionRec.teacherId === viewer.id
      : viewer?.role === "STUDENT" &&
        studentCanAccessSession(sessionRec, {
          id: viewer.id,
          role: viewer.role,
          school: viewer.school,
          grade: viewer.grade,
          className: viewer.className,
        });
  if (!canRead) throw new PublishQuestionsError("권한 없음", 403);

  const published = await prisma.question.findMany({
    where: { sessionId, source: "TEACHER_SHARED" },
    select: {
      id: true, content: true, inquiryType: true, closure: true, cognitive: true, createdAt: true,
      _count: { select: { comments: true, likes: true } },
      likes: { where: { userId }, select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return {
    published: published.map((q) => ({
      id: q.id, content: q.content, type: q.inquiryType,
      closure: q.closure, cognitive: q.cognitive,
      likeCount: q._count.likes,
      commentCount: q._count.comments,
      myLike: q.likes.length > 0,
      createdAt: q.createdAt,
    })),
    likesVisible: sessionRec.likesVisibleToPeers,
    commentsVisible: sessionRec.commentsVisibleToPeers,
  };
}

async function publishSequence(sessionId: string, teacherId: string, sequence: SharedQuestionItem[]) {
  const seq = normalizeSharedQuestions(sequence);
  const publishedAt = new Date().toISOString();
  const publishedSeq = seq.map((q) => ({ ...q, publishedAt }));

  const existing = await prisma.question.findMany({
    where: { sessionId, source: "TEACHER_SHARED" },
    select: {
      id: true,
      content: true,
      _count: { select: { likes: true, comments: true } },
    },
  });
  const existingByContent = new Map(existing.map((q) => [q.content.trim(), q]));
  const seqContents = new Set(seq.map((q) => q.content.trim()));

  const toCreate = seq.filter((q) => !existingByContent.has(q.content.trim()));
  await Promise.all(
    toCreate.map((q) =>
      prisma.question.create({
        data: {
          content: q.content.trim(),
          closure: "open",
          cognitive: "conceptual",
          source: "TEACHER_SHARED",
          inquiryType: q.type,
          isPublic: true,
          authorId: teacherId,
          sessionId,
        },
      }),
    ),
  );

  const removable = existing.filter(
    (q) =>
      !seqContents.has(q.content.trim()) &&
      q._count.likes === 0 &&
      q._count.comments === 0,
  );
  if (removable.length > 0) {
    const removableIds = removable.map((q) => q.id);
    await cleanupQuestionTranslations(removableIds);
    await prisma.question.deleteMany({
      where: { id: { in: removableIds }, source: "TEACHER_SHARED" },
    });
  }

  await prisma.questionSession.update({
    where: { id: sessionId },
    data: { sharedQuestions: publishedSeq as unknown as Prisma.InputJsonValue },
  });

  return {
    ok: true,
    count: seq.length,
    created: toCreate.length,
    reused: seq.length - toCreate.length,
    cleaned: removable.length,
    publishedAt,
  };
}

async function publishItems(sessionId: string, teacherId: string, items: PublishItem[]) {
  const existing = await prisma.question.findMany({
    where: { sessionId, source: "TEACHER_SHARED" },
    select: { id: true, content: true },
  });
  const existingContents = new Set(existing.map((q) => q.content.trim()));
  const newItems = items.filter((it) => it.content && !existingContents.has(it.content.trim()));

  const created = await Promise.all(
    newItems.map((it) =>
      prisma.question.create({
        data: {
          content: it.content.trim(),
          closure: "open",
          cognitive: "conceptual",
          source: "TEACHER_SHARED",
          inquiryType: it.type ?? null,
          isPublic: true,
          authorId: teacherId,
          sessionId,
        },
      })
    )
  );

  const publishedAt = new Date().toISOString();
  const all = [...existing.map((q) => ({ type: "", content: q.content, publishedAt })),
                ...created.map((q) => ({ type: q.inquiryType ?? "", content: q.content, publishedAt }))];
  await prisma.questionSession.update({
    where: { id: sessionId },
    data: { sharedQuestions: all as unknown as Prisma.InputJsonValue },
  });

  return {
    created: created.length,
    skipped: items.length - newItems.length,
    questions: created,
    publishedAt,
  };
}

export async function publishQuestionsToSession(sessionId: string, teacherId: string, body: Record<string, unknown>) {
  await assertTeacherOwnsSession(sessionId, teacherId);
  if (Array.isArray(body.sequence)) {
    return publishSequence(sessionId, teacherId, body.sequence as SharedQuestionItem[]);
  }
  const items = Array.isArray(body.questions) ? (body.questions as PublishItem[]) : [];
  return publishItems(sessionId, teacherId, items);
}

export async function deletePublishedQuestions(sessionId: string, teacherId: string, body: Record<string, unknown>) {
  const deleteAll = body.all === true;
  const questionIds = Array.isArray(body.questionIds) ? body.questionIds.filter((x: unknown) => typeof x === "string") : [];
  if (!deleteAll && questionIds.length === 0) throw new PublishQuestionsError("선택된 질문 없음", 400);

  await assertTeacherOwnsSession(sessionId, teacherId);

  if (deleteAll) {
    const toRemove = await prisma.question.findMany({
      where: { sessionId, source: "TEACHER_SHARED" },
      select: { id: true },
    });
    await cleanupQuestionTranslations(toRemove.map((x) => x.id));
    const removed = await prisma.question.deleteMany({
      where: { sessionId, source: "TEACHER_SHARED" },
    });
    await prisma.questionSession.update({
      where: { id: sessionId },
      data: { sharedQuestions: [] as unknown as Prisma.InputJsonValue },
    });
    return { ok: true, deleted: removed.count, all: true };
  }

  await cleanupQuestionTranslations(questionIds);
  await prisma.question.deleteMany({
    where: { id: { in: questionIds }, sessionId, source: "TEACHER_SHARED" },
  });

  const remaining = await prisma.question.findMany({
    where: { sessionId, source: "TEACHER_SHARED" },
    select: { content: true, inquiryType: true },
  });
  await prisma.questionSession.update({
    where: { id: sessionId },
    data: {
      sharedQuestions: remaining.map((q) => ({
        type: q.inquiryType ?? "", content: q.content,
      })) as unknown as Prisma.InputJsonValue,
    },
  });

  return { ok: true, deleted: questionIds.length };
}
