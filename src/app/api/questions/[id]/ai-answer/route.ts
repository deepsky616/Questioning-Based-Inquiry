import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { buildAnswerPrompt } from "@/lib/ai-prompts";
import { generateText, AiKeyMissingError } from "@/lib/ai";
import { canViewQuestion } from "@/lib/content-visibility";
import { loadQuestionAccessContext } from "@/lib/question-detail-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 AI 답변을 생성할 수 있습니다" }, { status: 403 });
  }

  const userId = (session.user as { id: string }).id;
  const access = await loadQuestionAccessContext(userId, id);
  if (!access.question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!canViewQuestion(access.viewer, access.question)) {
    return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
  }

  const limited = checkRateLimit(`ai-answer:${userId}`, 20);
  if (limited) return limited;

  const question = await prisma.question.findUnique({
    where: { id },
    select: { content: true, closure: true, cognitive: true, context: true },
  });
  if (!question) {
    return NextResponse.json({ error: "질문을 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const prompt = buildAnswerPrompt(
      question.content,
      question.closure ?? undefined,
      question.cognitive ?? undefined,
      question.context ?? undefined
    );
    const answer = await generateText({ userId, prompt, req, localize: true });
    return NextResponse.json({ answer });
  } catch (error) {
    if (error instanceof AiKeyMissingError) {
      return NextResponse.json({ error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." }, { status: 400 });
    }
    logger.error("AI answer generation error:", error);
    return NextResponse.json({ error: "AI 답변 생성에 실패했습니다" }, { status: 500 });
  }
}
