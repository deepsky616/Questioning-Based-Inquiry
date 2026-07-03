import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildStudentSessionPrompt } from "@/lib/ai-prompts";
import { generateJson } from "@/lib/ai";
import { getRequestLocale } from "@/lib/locale";

export interface StudentSessionAnalysisResult {
  summary: string;
  insights: string;
  relevanceInsights: string;
  growthInsights: string;
  rewriteExample: string;
}

export interface StudentSessionTotals {
  questions: number;
  comments: number;
  likesGiven: number;
}

/**
 * 한 학생의 한 수업 세션 활동을 AI로 분석하고 결과를 DB에 영속화한다(단건·일괄 공용).
 * - 그 세션에서 한 활동이 전혀 없으면 null을 반환(분석 스킵).
 * - AI 호출 실패(키 없음 등)는 예외를 그대로 던진다(호출부에서 처리).
 */
export async function runStudentSessionAnalysis(opts: {
  studentId: string;
  sessionId: string;
  req: Request;
}): Promise<{ result: StudentSessionAnalysisResult; totals: StudentSessionTotals } | null> {
  const { studentId, sessionId, req } = opts;

  const [qSession, student] = await Promise.all([
    prisma.questionSession.findUnique({ where: { id: sessionId }, select: { subject: true, topic: true } }),
    prisma.user.findUnique({ where: { id: studentId }, select: { name: true, role: true } }),
  ]);
  if (!qSession || !student || student.role !== "STUDENT") return null;

  const [questions, myComments, likesGiven] = await Promise.all([
    prisma.question.findMany({
      where: { sessionId, authorId: studentId },
      select: { content: true, closure: true, cognitive: true, _count: { select: { likes: true, comments: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.comment.findMany({
      where: { authorId: studentId, question: { sessionId } },
      select: { content: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.questionLike.count({ where: { userId: studentId, question: { sessionId } } }),
  ]);

  if (questions.length === 0 && myComments.length === 0 && likesGiven === 0) return null;

  const priorQuestions = await prisma.question.findMany({
    where: { authorId: studentId, sessionId: { not: sessionId } },
    select: { closure: true, cognitive: true },
  });
  const prior = {
    totalQuestions: priorQuestions.length,
    open: priorQuestions.filter((q) => q.closure === "open").length,
    conceptual: priorQuestions.filter((q) => q.cognitive === "conceptual").length,
    controversial: priorQuestions.filter((q) => q.cognitive === "controversial").length,
  };

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
  const parsed = await generateJson<{
    summary?: string; insights?: string; relevanceInsights?: string; growthInsights?: string; rewriteExample?: string;
  }>({ userId: studentId, prompt, req, localize: true, quality: true });

  const result: StudentSessionAnalysisResult = {
    summary: parsed?.summary ?? "",
    insights: parsed?.insights ?? "",
    relevanceInsights: parsed?.relevanceInsights ?? "",
    growthInsights: parsed?.growthInsights ?? "",
    rewriteExample: parsed?.rewriteExample ?? "",
  };

  // DB 영속화(베스트 에포트)
  const stored = result as unknown as Prisma.InputJsonValue;
  try {
    await prisma.sessionAnalysis.upsert({
      where: { sessionId_scope_studentId: { sessionId, scope: "student", studentId } },
      create: { sessionId, scope: "student", studentId, result: stored, locale: getRequestLocale(req) },
      update: { result: stored, locale: getRequestLocale(req) },
    });
  } catch {
    // 저장 실패해도 결과는 반환
  }

  return { result, totals: { questions: questions.length, comments: myComments.length, likesGiven } };
}
