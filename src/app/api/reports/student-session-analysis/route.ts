import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { resolveGeminiModel } from "@/lib/api-config";
import { buildStudentSessionPrompt } from "@/lib/ai-prompts";
import { logger } from "@/lib/logger";

// 한 수업 세션에서 '학생 본인'의 질문·좋아요·댓글 활동을 AI가 분석
// POST body: { sessionId, studentId? }  studentId는 교사가 특정 학생을 볼 때만
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });
  const targetId = role === "TEACHER" && typeof body.studentId === "string" ? body.studentId : userId;

  const limited = checkRateLimit(`student-session-analysis:${userId}`, 15);
  if (limited) return limited;

  const [qSession, student] = await Promise.all([
    prisma.questionSession.findUnique({ where: { id: sessionId }, select: { subject: true, topic: true } }),
    prisma.user.findUnique({ where: { id: targetId }, select: { name: true, role: true } }),
  ]);
  if (!qSession) return NextResponse.json({ error: "세션 없음" }, { status: 404 });
  if (!student || student.role !== "STUDENT") return NextResponse.json({ error: "학생 없음" }, { status: 404 });

  const [questions, myComments, likesGiven] = await Promise.all([
    prisma.question.findMany({
      where: { sessionId, authorId: targetId },
      select: { content: true, closure: true, cognitive: true, _count: { select: { likes: true, comments: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.comment.findMany({
      where: { authorId: targetId, question: { sessionId } },
      select: { content: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.questionLike.count({ where: { userId: targetId, question: { sessionId } } }),
  ]);

  if (questions.length === 0 && myComments.length === 0 && likesGiven === 0) {
    return NextResponse.json({ error: "이 세션에서 한 활동이 없어요" }, { status: 400 });
  }

  // 지난 세션 대비 성장 비교용: 이 세션을 제외한 학생의 누적 질문 분포
  const priorQuestions = await prisma.question.findMany({
    where: { authorId: targetId, sessionId: { not: sessionId } },
    select: { closure: true, cognitive: true },
  });
  const prior = {
    totalQuestions: priorQuestions.length,
    open: priorQuestions.filter((q) => q.closure === "open").length,
    conceptual: priorQuestions.filter((q) => q.cognitive === "conceptual").length,
    controversial: priorQuestions.filter((q) => q.cognitive === "controversial").length,
  };

  const apiKeyRecord = await prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } });
  if (!apiKeyRecord?.value) {
    return NextResponse.json({ error: "AI 설정이 필요합니다. 선생님께 API 키 설정을 요청하세요." }, { status: 400 });
  }
  const modelRecord = await prisma.systemConfig.findUnique({ where: { key: "gemini_model" } });

  try {
    const genAI = new GoogleGenerativeAI(apiKeyRecord.value);
    const model = genAI.getGenerativeModel({ model: resolveGeminiModel(modelRecord?.value) });
    const prompt = buildStudentSessionPrompt({
      studentName: student.name,
      subject: qSession.subject,
      topic: qSession.topic,
      questions: questions.map((q) => ({
        content: q.content, closure: q.closure, cognitive: q.cognitive,
        likeCount: q._count.likes, commentCount: q._count.comments,
      })),
      myComments: myComments.map((c) => c.content),
      likesGiven,
      prior,
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;

    return NextResponse.json({
      summary: parsed?.summary ?? "",
      insights: parsed?.insights ?? "",
      relevanceInsights: parsed?.relevanceInsights ?? "",
      growthInsights: parsed?.growthInsights ?? "",
      rewriteExample: parsed?.rewriteExample ?? "",
      totals: { questions: questions.length, comments: myComments.length, likesGiven },
    });
  } catch (error) {
    logger.error("student session analysis error:", error);
    return NextResponse.json({ error: "AI 분석에 실패했습니다" }, { status: 500 });
  }
}
