import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cleanupQuestionTranslations } from "@/lib/translation-cleanup";
import { Prisma } from "@prisma/client";
import { normalizeSharedQuestions, type SharedQuestionItem } from "@/lib/shared-questions";

interface PublishItem { type?: string; content: string; publishedAt?: string }

// 현재 세션에 배포된 교사 질문 + 댓글 수 조회
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const sessionId = params.id;
  const [published, sessionRec] = await Promise.all([
    prisma.question.findMany({
      where: { sessionId, source: "TEACHER_SHARED" },
      select: {
        id: true, content: true, inquiryType: true, closure: true, cognitive: true, createdAt: true,
        _count: { select: { comments: true, likes: true } },
        likes: { where: { userId }, select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.questionSession.findUnique({
      where: { id: sessionId },
      select: { likesVisibleToPeers: true, commentsVisibleToPeers: true },
    }),
  ]);

  return NextResponse.json({
    published: published.map((q) => ({
      id: q.id, content: q.content, type: q.inquiryType,
      closure: q.closure, cognitive: q.cognitive,
      likeCount: q._count.likes,
      commentCount: q._count.comments,
      myLike: q.likes.length > 0,
      createdAt: q.createdAt,
    })),
    likesVisible: sessionRec?.likesVisibleToPeers ?? true,
    commentsVisible: sessionRec?.commentsVisibleToPeers ?? true,
  });
}

// 선택된 단원설계 질문들을 세션에 배포
// POST body: { questions: [{ type, content }] }
// 멱등: 같은 content가 이미 TEACHER_SHARED로 있으면 건너뜀
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const sessionId = params.id;
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.questions) ? (body.questions as PublishItem[]) : [];

  // 세션 권한 검증 + 단원설계 조회
  const qs = await prisma.questionSession.findUnique({
    where: { id: sessionId },
    select: { id: true, teacherId: true, sharedQuestions: true },
  });
  if (!qs) return NextResponse.json({ error: "세션 없음" }, { status: 404 });
  if (qs.teacherId !== teacherId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // 신규: 질문 중심 탐구설계 시퀀스 배포 (그룹/순서 포함)
  // 재배포 시 데이터 무결성 원칙:
  //  - 시퀀스의 모든 질문을 TEACHER_SHARED로 배포(학생이 좋아요·댓글로 참여 가능)
  //  - content가 같은 기존 질문은 재사용하여 이미 받은 좋아요·댓글을 그대로 유지
  //  - 새 시퀀스에서 빠졌더라도 좋아요·댓글이 있으면 절대 삭제하지 않음(손실 방지)
  //  - 참여가 전혀 없는(좋아요 0·댓글 0) 빠진 질문만 정리해 목록을 깔끔히 유지
  if (Array.isArray(body.sequence)) {
    const seq = normalizeSharedQuestions(body.sequence as SharedQuestionItem[]);
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

    // 아직 배포되지 않은 질문만 새로 생성(기존 질문은 그대로 두어 좋아요·댓글 유지)
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

    // 새 시퀀스에서 빠졌고 참여 기록도 전혀 없는 질문만 정리(좋아요·댓글이 있으면 보존)
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

    // sharedQuestions에 전체 시퀀스(그룹/순서) 저장
    await prisma.questionSession.update({
      where: { id: sessionId },
      data: { sharedQuestions: publishedSeq as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({
      ok: true,
      count: seq.length,
      created: toCreate.length,
      reused: seq.length - toCreate.length,
      cleaned: removable.length,
      publishedAt,
    });
  }

  // 이미 배포된 교사 질문 조회
  const existing = await prisma.question.findMany({
    where: { sessionId, source: "TEACHER_SHARED" },
    select: { id: true, content: true },
  });
  const existingContents = new Set(existing.map((q) => q.content.trim()));

  // 새로 배포할 질문만 필터
  const newItems = items.filter((it) => it.content && !existingContents.has(it.content.trim()));

  // Question으로 생성
  const created = await Promise.all(
    newItems.map((it) =>
      prisma.question.create({
        data: {
          content: it.content.trim(),
          closure: "open",         // 교사 배포 질문 기본값 (탐구는 보통 열린 질문)
          cognitive: "conceptual", // 기본값
          source: "TEACHER_SHARED",
          inquiryType: it.type ?? null,
          isPublic: true,
          authorId: teacherId,
          sessionId,
        },
      })
    )
  );

  // sharedQuestions JSON 동기화 (시각화 호환)
  const publishedAt = new Date().toISOString();
  const all = [...existing.map((q) => ({ type: "", content: q.content, publishedAt })),
                ...created.map((q) => ({ type: q.inquiryType ?? "", content: q.content, publishedAt }))];
  await prisma.questionSession.update({
    where: { id: sessionId },
    data: { sharedQuestions: all as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({
    created: created.length,
    skipped: items.length - newItems.length,
    questions: created,
    publishedAt,
  });
}

// 배포 취소
// DELETE body: { questionIds: [...] }  선택된 교사 질문만 삭제
//             | { all: true }          이 세션의 배포 전체 삭제(탐구설계 배포 취소)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const sessionId = params.id;
  const body = await req.json().catch(() => ({}));
  const deleteAll = body.all === true;
  const questionIds = Array.isArray(body.questionIds) ? body.questionIds.filter((x: unknown) => typeof x === "string") : [];
  if (!deleteAll && questionIds.length === 0) return NextResponse.json({ error: "선택된 질문 없음" }, { status: 400 });

  // 세션 권한 검증
  const qs = await prisma.questionSession.findUnique({
    where: { id: sessionId },
    select: { teacherId: true },
  });
  if (!qs) return NextResponse.json({ error: "세션 없음" }, { status: 404 });
  if (qs.teacherId !== teacherId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // 배포 전체 삭제: TEACHER_SHARED 질문 모두 제거 + sharedQuestions 비우기
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
    return NextResponse.json({ ok: true, deleted: removed.count, all: true });
  }

  // TEACHER_SHARED 만 삭제 가능
  await cleanupQuestionTranslations(questionIds);
  await prisma.question.deleteMany({
    where: { id: { in: questionIds }, sessionId, source: "TEACHER_SHARED" },
  });

  // sharedQuestions 재동기화
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

  return NextResponse.json({ ok: true, deleted: questionIds.length });
}
