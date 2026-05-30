import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

interface PublishItem { type?: string; content: string }

// 현재 세션에 배포된 교사 질문 + 댓글 수 조회
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = params.id;
  const published = await prisma.question.findMany({
    where: { sessionId, source: "TEACHER_SHARED" },
    select: {
      id: true, content: true, inquiryType: true, createdAt: true,
      _count: { select: { comments: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    published: published.map((q) => ({
      id: q.id, content: q.content, type: q.inquiryType,
      commentCount: q._count.comments,
      createdAt: q.createdAt,
    })),
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
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
          closure: "open",         // 교사 배포 질문 기본값 (탐구는 보통 개방형)
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
  const all = [...existing.map((q) => ({ type: "", content: q.content })),
                ...created.map((q) => ({ type: q.inquiryType ?? "", content: q.content }))];
  await prisma.questionSession.update({
    where: { id: sessionId },
    data: { sharedQuestions: all as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({
    created: created.length,
    skipped: items.length - newItems.length,
    questions: created,
  });
}

// 배포 취소 (선택된 교사 질문 삭제)
// DELETE body: { questionIds: [...] }
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const sessionId = params.id;
  const body = await req.json().catch(() => ({}));
  const questionIds = Array.isArray(body.questionIds) ? body.questionIds.filter((x: unknown) => typeof x === "string") : [];
  if (questionIds.length === 0) return NextResponse.json({ error: "선택된 질문 없음" }, { status: 400 });

  // 세션 권한 검증
  const qs = await prisma.questionSession.findUnique({
    where: { id: sessionId },
    select: { teacherId: true },
  });
  if (!qs) return NextResponse.json({ error: "세션 없음" }, { status: 404 });
  if (qs.teacherId !== teacherId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // TEACHER_SHARED 만 삭제 가능
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
