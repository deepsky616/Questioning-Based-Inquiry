import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { buildSessionAnalysisPrompt } from "@/lib/ai-prompts";
import { generateJsonWithMetadata, AiKeyMissingError, AiBusyError, AiQuotaError } from "@/lib/ai";
import { getRequestLocale } from "@/lib/locale";

type Params = { params: Promise<{ id: string }> };

// 저장된 학급 세션 분석 조회(AI 호출 없음) — 질문조회/대시보드가 공유한 결과를 불러온다.
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 가능합니다" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;
  const owned = await prisma.questionSession.findUnique({ where: { id }, select: { teacherId: true } });
  if (!owned || owned.teacherId !== teacherId) return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  const row = await prisma.sessionAnalysis.findUnique({
    where: { sessionId_scope_studentId: { sessionId: id, scope: "class", studentId: "" } },
    select: { result: true },
  });
  return NextResponse.json({ analysis: row?.result ?? null });
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 세션 분석을 실행할 수 있습니다" }, { status: 403 });
  }

  const limited = checkRateLimit(`session-analysis:${(session.user as { id: string }).id}`, 10);
  if (limited) return limited;

  const questionSession = await prisma.questionSession.findUnique({
    where: { id },
    include: {
      questions: {
        select: {
          content: true,
          closure: true,
          cognitive: true,
          source: true,
          author: {
            select: {
              role: true,
            },
          },
          _count: { select: { likes: true } },
          comments: {
            select: {
              content: true,
              author: {
                select: {
                  name: true,
                  role: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!questionSession) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다" }, { status: 404 });
  }

  const teacherId = (session.user as { id: string }).id;
  if (questionSession.teacherId !== teacherId) {
    return NextResponse.json({ error: "세션 분석 권한이 없습니다" }, { status: 403 });
  }

  const questions = questionSession.questions
    // 학생이 직접 만든 질문 + 교사가 배포한 탐구설계 질문(TEACHER_SHARED)을 모두 분석 대상에 포함
    .filter((q) => q.author.role !== "TEACHER" || q.source === "TEACHER_SHARED")
    .map((q) => ({
      content: q.content,
      closure: q.closure,
      cognitive: q.cognitive,
      kind: (q.source === "TEACHER_SHARED" ? "deployed" : "student") as "deployed" | "student",
      likeCount: q._count.likes,
      comments: q.comments
        .filter((comment) => comment.author.role !== "TEACHER")
        .map((comment) => ({
          content: comment.content,
          authorRole: comment.author.role,
          authorName: comment.author.name,
        })),
    }));
  const totalComments = questions.reduce((count, question) => count + question.comments.length, 0);
  const totalLikes = questions.reduce((count, question) => count + question.likeCount, 0);

  try {
    const prompt = buildSessionAnalysisPrompt(questions, questionSession.subject, questionSession.topic);
    const generated = await generateJsonWithMetadata<{
      summary: string;
      themes: string[];
      insights: string;
      commentInsights?: string;
      engagementInsights?: string;
      relevanceInsights?: string;
      balanceInsights?: string;
      bestQuestion?: string;
      nextQuestions?: string;
    }>({ userId: teacherId, prompt, req, localize: true, quality: true });
    const parsed = generated.data;
    const analyzedAt = new Date().toISOString();

    // 저장·반환 결과(테마·집계까지 포함해 질문조회/대시보드 어디서든 그대로 복원 가능)
    const stored = {
      summary: parsed.summary ?? "",
      insights: parsed.insights ?? "",
      commentInsights: parsed.commentInsights ?? "",
      engagementInsights: parsed.engagementInsights ?? "",
      relevanceInsights: parsed.relevanceInsights ?? "",
      balanceInsights: parsed.balanceInsights ?? "",
      bestQuestion: parsed.bestQuestion ?? "",
      nextQuestions: parsed.nextQuestions ?? "",
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      totalQuestions: questions.length,
      totalComments,
      totalLikes,
      analyzedAt,
      analysisModel: generated.model,
    };

    // DB 영속화(베스트 에포트) — 질문조회·대시보드·다른 기기에서 마지막 분석 공유
    try {
      await prisma.sessionAnalysis.upsert({
        where: { sessionId_scope_studentId: { sessionId: id, scope: "class", studentId: "" } },
        create: { sessionId: id, scope: "class", studentId: "", result: stored, locale: getRequestLocale(req) },
        update: { result: stored, locale: getRequestLocale(req) },
      });
    } catch (e) {
      logger.error("session analysis persist error:", e);
    }

    return NextResponse.json(stored);
  } catch (error) {
    if (error instanceof AiKeyMissingError) {
      return NextResponse.json({ error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." }, { status: 400 });
    }
    if (error instanceof AiQuotaError) {
      return NextResponse.json({ error: "AI 무료 사용량 한도를 초과했어요. 내일 다시 시도하거나 유료 API 키를 설정해 주세요." }, { status: 503 });
    }
    if (error instanceof AiBusyError) {
      // 재시도까지 실패한 일시적 모델 혼잡 — 원인을 정확히 안내
      return NextResponse.json({ error: "AI 모델이 혼잡합니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
    }
    logger.error("Session analysis error:", error);
    return NextResponse.json({ error: "AI 분석에 실패했습니다" }, { status: 500 });
  }
}
