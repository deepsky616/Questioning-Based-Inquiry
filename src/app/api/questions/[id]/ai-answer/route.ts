import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildAnswerPrompt } from "@/lib/ai-prompts";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 AI 답변을 생성할 수 있습니다" }, { status: 403 });
  }

  const question = await prisma.question.findUnique({ where: { id: params.id } });
  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }

  const [apiKeyRecord, modelRecord] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } }),
    prisma.systemConfig.findUnique({ where: { key: "gemini_model" } }),
  ]);

  if (!apiKeyRecord?.value) {
    return NextResponse.json({ error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." }, { status: 400 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKeyRecord.value);
    const model = genAI.getGenerativeModel({ model: modelRecord?.value ?? "gemini-2.5-flash" });

    const prompt = buildAnswerPrompt(question.content, question.context ?? undefined);
    const result = await model.generateContent(prompt);
    const answer = result.response.text().trim();

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("AI answer generation error:", error);
    return NextResponse.json({ error: "AI 답변 생성에 실패했습니다" }, { status: 500 });
  }
}
