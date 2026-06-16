import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { resolveGeminiModel } from "@/lib/api-config";
import { logger } from "@/lib/logger";
import {
  buildSequencePrompt,
  fallbackSequenceQuestions,
  getUnitFlow,
  type SequenceInputQuestion,
  type SequencedQuestion,
} from "@/lib/unit-sequence";

const sequenceSchema = z.object({
  sessionId: z.string().min(1),
  flowId: z.string().min(1).default("cognitive-development"),
  additionalQuestions: z.array(z.string().min(1).max(500)).optional().default([]),
  // merge: 비슷한 질문을 1개로 통합 변형 / sort: 통합 없이 흐름 기준 정렬
  mode: z.enum(["merge", "sort"]).optional().default("sort"),
});

function normalizeSequencedQuestions(
  value: unknown,
  sourceQuestions: SequenceInputQuestion[],
  mode: "merge" | "sort" = "sort",
): SequencedQuestion[] {
  if (!Array.isArray(value)) return [];
  const sourceById = new Map(sourceQuestions.map((question) => [question.id, question]));

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      // 통합(merge) 모드에서는 새 통합 질문이므로 원본 id가 없으면 새 id를 부여한다
      const id = typeof raw.id === "string" ? raw.id : (mode === "merge" ? `merged-${index + 1}` : sourceQuestions[index]?.id);
      const source = id ? sourceById.get(id) : undefined;
      const content = typeof raw.content === "string" ? raw.content : source?.content;
      if (!id || !content) return null;

      return {
        id,
        type: typeof raw.type === "string" ? raw.type : source?.cognitive ?? "student",
        content,
        source: raw.source === "teacher" ? "teacher" : source?.source ?? "student",
        contentGroup: typeof raw.contentGroup === "string" && raw.contentGroup.trim()
          ? raw.contentGroup.trim()
          : "공통 탐구 질문",
        priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : index + 1,
        lessonPhase: typeof raw.lessonPhase === "string" && raw.lessonPhase.trim()
          ? raw.lessonPhase.trim()
          : "탐구",
        rationale: typeof raw.rationale === "string" && raw.rationale.trim()
          ? raw.rationale.trim()
          : "단원 설계 흐름에 맞춰 배치했습니다.",
      } satisfies SequencedQuestion;
    })
    .filter((item): item is SequencedQuestion => item !== null)
    .sort((a, b) => a.priority - b.priority)
    .map((item, index) => ({ ...item, priority: index + 1 }));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as { id: string; role?: string };
  if (user.role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 사용할 수 있습니다" }, { status: 403 });
  }

  const limited = checkRateLimit(`unit-design-sequence:${user.id}`, 10);
  if (limited) return limited;

  try {
    const body = await req.json();
    const data = sequenceSchema.parse(body);

    const questionSession = await prisma.questionSession.findFirst({
      where: { id: data.sessionId, teacherId: user.id },
      select: { id: true, subject: true, topic: true, date: true },
    });

    if (!questionSession) {
      return NextResponse.json({ error: "수업세션을 찾을 수 없습니다" }, { status: 404 });
    }

    const studentQuestions = await prisma.question.findMany({
      where: { sessionId: data.sessionId },
      select: { id: true, content: true, cognitive: true, context: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const questions: SequenceInputQuestion[] = [
      ...studentQuestions.map((question) => ({
        id: question.id,
        content: question.content,
        cognitive: question.cognitive,
        context: question.context,
        source: "student" as const,
      })),
      ...data.additionalQuestions.map((content, index) => ({
        id: `teacher-${Date.now()}-${index}`,
        content,
        cognitive: null,
        source: "teacher" as const,
      })),
    ].filter((question) => question.content.trim().length > 0);

    if (questions.length === 0) {
      return NextResponse.json({ error: "분류할 질문이 없습니다" }, { status: 400 });
    }

    const flow = getUnitFlow(data.flowId);
    let sequencedQuestions = fallbackSequenceQuestions(questions, flow.id);
    let generatedBy: "ai" | "rules" = "rules";

    const [keyRecord, modelRecord] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } }),
      prisma.systemConfig.findUnique({ where: { key: "gemini_model" } }),
    ]);

    if (keyRecord?.value) {
      try {
        const genAI = new GoogleGenerativeAI(keyRecord.value);
        const model = genAI.getGenerativeModel({ model: resolveGeminiModel(modelRecord?.value) });
        const result = await model.generateContent(
          buildSequencePrompt({
            flowId: flow.id,
            subject: questionSession.subject,
            topic: questionSession.topic,
            questions,
            mode: data.mode,
          }),
        );
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        const aiQuestions = normalizeSequencedQuestions(parsed?.sequencedQuestions, questions, data.mode);
        // 정렬 모드는 질문 수가 유지돼야 하지만, 통합 모드는 줄어들 수 있다
        const ok = data.mode === "merge"
          ? aiQuestions.length > 0 && aiQuestions.length <= questions.length
          : aiQuestions.length === questions.length;
        if (ok) {
          sequencedQuestions = aiQuestions;
          generatedBy = "ai";
        }
      } catch (error) {
        logger.error("unit-design sequence AI fallback:", error);
      }
    }

    return NextResponse.json({
      session: questionSession,
      flow,
      generatedBy,
      sequencedQuestions,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("unit-design sequence error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
