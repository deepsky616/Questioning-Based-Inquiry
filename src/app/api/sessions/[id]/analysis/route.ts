import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildSessionAnalysisPrompt } from "@/lib/ai-prompts";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 세션 분석을 실행할 수 있습니다" }, { status: 403 });
  }

  const questionSession = await prisma.questionSession.findUnique({
    where: { id: params.id },
    include: {
      questions: {
        select: { content: true, closure: true, cognitive: true },
      },
    },
  });

  if (!questionSession) {
    return NextResponse.json({ error: "세션을 찾을 수 없습니다" }, { status: 404 });
  }

  const [apiKeyRecord, modelRecord] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } }),
    prisma.systemConfig.findUnique({ where: { key: "gemini_model" } }),
  ]);

  if (!apiKeyRecord?.value) {
    return NextResponse.json({ error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." }, { status: 400 });
  }

  const questions = questionSession.questions.map((q) => ({
    content: q.content,
    closure: q.closure,
    cognitive: q.cognitive,
  }));

  try {
    const genAI = new GoogleGenerativeAI(apiKeyRecord.value);
    const model = genAI.getGenerativeModel({ model: modelRecord?.value ?? "gemini-2.5-flash" });

    const prompt = buildSessionAnalysisPrompt(questions, questionSession.subject, questionSession.topic);
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Invalid response format");

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary: string;
      themes: string[];
      insights: string;
    };

    return NextResponse.json({
      summary: parsed.summary ?? "",
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      insights: parsed.insights ?? "",
      totalQuestions: questions.length,
    });
  } catch (error) {
    console.error("Session analysis error:", error);
    return NextResponse.json({ error: "AI 분석에 실패했습니다" }, { status: 500 });
  }
}
