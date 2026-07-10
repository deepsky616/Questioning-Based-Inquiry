import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { AiKeyMissingError, generateJsonWithMetadata } from "@/lib/ai";
import {
  CLASSIFICATION_PROMPT,
  fallbackClassification,
  parseClassificationResponse,
} from "@/lib/classify";
import type { ClassificationResult } from "@/types/question";
import {
  PRACTICE_QUIZ_BANK,
  PRACTICE_TRANSFORM_BANK,
  PRACTICE_CREATE_TOPICS,
  isTargetAchieved,
} from "@/lib/question-practice-data";
import {
  PRACTICE_GAME_ID,
  PRACTICE_POINTS,
  buildPracticeDedupeKey,
  practiceDayStartUtc,
  clampToDailyCap,
} from "@/lib/practice-points";

// 질문 연습 판정 + 포인트 지급.
// 채점을 서버가 다시 수행하므로 클라이언트 값은 신뢰하지 않는다.
// (분류 퀴즈: 문항 은행 대조, 바꾸기·만들기: 서버가 직접 AI 분류 수행)

const bodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("quiz"),
    itemId: z.string().min(1),
    quizType: z.enum(["closure", "cognitive"]),
    answer: z.string().min(1),
  }),
  z.object({
    mode: z.literal("transform"),
    itemId: z.string().min(1),
    content: z.string().min(1).max(200),
  }),
  z.object({
    mode: z.literal("create"),
    topicId: z.string().min(1),
    target: z.enum(["open", "conceptual", "controversial"]),
    content: z.string().min(1).max(200),
  }),
]);

interface AwardOutcome {
  awarded: number;
  capped: boolean;
  alreadyAwarded: boolean;
}

const NO_AWARD: AwardOutcome = { awarded: 0, capped: false, alreadyAwarded: false };

async function awardPracticePoints(
  studentId: string,
  bonusType: string,
  dedupeKey: string,
  requested: number,
  reason: string,
): Promise<AwardOutcome> {
  const earnedToday = await prisma.pointLog.aggregate({
    _sum: { points: true },
    where: {
      studentId,
      gameId: PRACTICE_GAME_ID,
      createdAt: { gte: practiceDayStartUtc() },
    },
  });
  const points = clampToDailyCap(requested, earnedToday._sum.points ?? 0);
  if (points <= 0) return { awarded: 0, capped: true, alreadyAwarded: false };

  try {
    await prisma.$transaction([
      prisma.pointLog.create({
        data: {
          studentId,
          gameId: PRACTICE_GAME_ID,
          roomCode: dedupeKey, // uniq_point_award 제약이 같은 문항·같은 날 재지급을 막는다
          bonusType,
          points,
          reason,
          status: "APPROVED",
        },
      }),
      prisma.user.update({
        where: { id: studentId },
        data: { totalPoints: { increment: points } },
      }),
    ]);
    return { awarded: points, capped: false, alreadyAwarded: false };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { awarded: 0, capped: false, alreadyAwarded: true };
    }
    throw e;
  }
}

async function classifyContent(
  userId: string,
  req: Request,
  content: string,
): Promise<ClassificationResult> {
  try {
    const generated = await generateJsonWithMetadata<unknown>({
      userId,
      prompt: `${CLASSIFICATION_PROMPT}\n\n[분석할 질문]\n${content}`,
      req,
      localize: true,
      quality: true,
      temperature: 0,
    });
    return parseClassificationResponse(JSON.stringify(generated.data)) ?? fallbackClassification(content);
  } catch (error) {
    if (error instanceof AiKeyMissingError) return fallbackClassification(content);
    throw error;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;
  const isStudent = (session.user as { role?: string }).role === "STUDENT";

  const { success } = rateLimit(`practice:${userId}`, { limit: 20, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  try {
    const body = bodySchema.parse(await req.json());

    if (body.mode === "quiz") {
      const item = PRACTICE_QUIZ_BANK.find((q) => q.id === body.itemId);
      if (!item) {
        return NextResponse.json({ error: "존재하지 않는 문항입니다" }, { status: 400 });
      }
      const correct = item[body.quizType] === body.answer;
      if (!correct || !isStudent) {
        return NextResponse.json({ correct, ...NO_AWARD });
      }
      const award = await awardPracticePoints(
        userId,
        "PRACTICE_QUIZ",
        buildPracticeDedupeKey("quiz", `${item.id}:${body.quizType}`),
        PRACTICE_POINTS.QUIZ_CORRECT,
        `질문 연습: 분류 정답 (${item.id}/${body.quizType})`,
      );
      return NextResponse.json({ correct, ...award });
    }

    if (body.mode === "transform") {
      const item = PRACTICE_TRANSFORM_BANK.find((t) => t.id === body.itemId);
      if (!item) {
        return NextResponse.json({ error: "존재하지 않는 문항입니다" }, { status: 400 });
      }
      const classification = await classifyContent(userId, req, body.content);
      const achieved = isTargetAchieved(item.target, classification) && !classification.inappropriate;
      if (!achieved || !isStudent) {
        return NextResponse.json({ classification, achieved, ...NO_AWARD });
      }
      const award = await awardPracticePoints(
        userId,
        "PRACTICE_TRANSFORM",
        buildPracticeDedupeKey("transform", item.id),
        PRACTICE_POINTS.TARGET_ACHIEVED,
        `질문 연습: 질문 바꾸기 성공 (${item.id})`,
      );
      return NextResponse.json({ classification, achieved, ...award });
    }

    const topic = PRACTICE_CREATE_TOPICS.find((t) => t.id === body.topicId);
    if (!topic) {
      return NextResponse.json({ error: "존재하지 않는 주제입니다" }, { status: 400 });
    }
    const classification = await classifyContent(userId, req, body.content);
    const achieved = isTargetAchieved(body.target, classification) && !classification.inappropriate;
    if (!achieved || !isStudent) {
      return NextResponse.json({ classification, achieved, ...NO_AWARD });
    }
    const award = await awardPracticePoints(
      userId,
      "PRACTICE_CREATE",
      buildPracticeDedupeKey("create", `${topic.id}:${body.target}`),
      PRACTICE_POINTS.TARGET_ACHIEVED,
      `질문 연습: 질문 만들기 성공 (${topic.id}/${body.target})`,
    );
    return NextResponse.json({ classification, achieved, ...award });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Practice award error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
