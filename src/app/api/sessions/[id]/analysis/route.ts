import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { buildSessionAnalysisPrompt } from "@/lib/ai-prompts";
import { generateJson, AiKeyMissingError } from "@/lib/ai";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 세션 분석을 실행할 수 있습니다" }, { status: 403 });
  }

  const limited = checkRateLimit(`session-analysis:${(session.user as { id: string }).id}`, 10);
  if (limited) return limited;

  const questionSession = await prisma.questionSession.findUnique({
    where: { id: params.id },
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
    const parsed = await generateJson<{
      summary: string;
      themes: string[];
      insights: string;
      commentInsights?: string;
      engagementInsights?: string;
      relevanceInsights?: string;
      balanceInsights?: string;
      bestQuestion?: string;
      nextQuestions?: string;
    }>({ userId: teacherId, prompt, req, localize: true });

    return NextResponse.json({
      summary: parsed.summary ?? "",
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      insights: parsed.insights ?? "",
      commentInsights: parsed.commentInsights ?? "",
      engagementInsights: parsed.engagementInsights ?? "",
      relevanceInsights: parsed.relevanceInsights ?? "",
      balanceInsights: parsed.balanceInsights ?? "",
      bestQuestion: parsed.bestQuestion ?? "",
      nextQuestions: parsed.nextQuestions ?? "",
      totalQuestions: questions.length,
      totalComments,
      totalLikes,
    });
  } catch (error) {
    if (error instanceof AiKeyMissingError) {
      return NextResponse.json({ error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." }, { status: 400 });
    }
    logger.error("Session analysis error:", error);
    return NextResponse.json({ error: "AI 분석에 실패했습니다" }, { status: 500 });
  }
}
