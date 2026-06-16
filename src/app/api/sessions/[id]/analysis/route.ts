import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { buildSessionAnalysisPrompt } from "@/lib/ai-prompts";
import { resolveGeminiModel } from "@/lib/api-config";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
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

  const [apiKeyRecord, modelRecord] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } }),
    prisma.systemConfig.findUnique({ where: { key: "gemini_model" } }),
  ]);

  if (!apiKeyRecord?.value) {
    return NextResponse.json({ error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." }, { status: 400 });
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
    const genAI = new GoogleGenerativeAI(apiKeyRecord.value);
    const model = genAI.getGenerativeModel({ model: resolveGeminiModel(modelRecord?.value) });

    const prompt = buildSessionAnalysisPrompt(questions, questionSession.subject, questionSession.topic);
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Invalid response format");

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary: string;
      themes: string[];
      insights: string;
      commentInsights?: string;
      engagementInsights?: string;
      relevanceInsights?: string;
    };

    return NextResponse.json({
      summary: parsed.summary ?? "",
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      insights: parsed.insights ?? "",
      commentInsights: parsed.commentInsights ?? "",
      engagementInsights: parsed.engagementInsights ?? "",
      relevanceInsights: parsed.relevanceInsights ?? "",
      totalQuestions: questions.length,
      totalComments,
      totalLikes,
    });
  } catch (error) {
    logger.error("Session analysis error:", error);
    return NextResponse.json({ error: "AI 분석에 실패했습니다" }, { status: 500 });
  }
}
