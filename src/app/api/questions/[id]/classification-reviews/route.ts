import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditQuestionForUser, loadQuestionAccessContext } from "@/lib/question-detail-service";
import { canViewQuestion } from "@/lib/content-visibility";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  try {
    const { id } = await params;
    const userId = session.user.id;
    const access = await loadQuestionAccessContext(userId, id);
    if (!access.question) return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
    const allowed = access.viewer?.role === "TEACHER"
      ? await canEditQuestionForUser({ role: "TEACHER", userId, questionId: id, authorId: access.question.authorId, fields: ["closure", "cognitive"] })
      : access.viewer?.role === "STUDENT" && access.question.authorId === userId && canViewQuestion(access.viewer, access.question);
    if (!allowed) return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    const page = Number(new URL(req.url).searchParams.get("page") ?? "1");
    if (!Number.isInteger(page) || page < 1 || page > 10000) return NextResponse.json({ error: "잘못된 페이지입니다" }, { status: 400 });
    const records = await prisma.questionClassificationReview.findMany({
      where: { questionId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 10, take: 11,
      select: { id: true, previousClosure: true, previousCognitive: true, closure: true, cognitive: true, reason: true, createdAt: true, reviewer: { select: { name: true } } },
    });
    return NextResponse.json({ records: records.slice(0, 10), page, hasMore: records.length > 10 });
  } catch {
    return NextResponse.json({ error: "분류 확인 이력을 불러오지 못했습니다" }, { status: 500 });
  }
}
