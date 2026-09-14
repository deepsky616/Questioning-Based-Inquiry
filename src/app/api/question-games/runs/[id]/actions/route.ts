import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import {
  authenticatedQuestionGameActorId,
  questionGameRunFailure,
  readQuestionGameRunBody,
} from "@/lib/question-game-run-route";
import { generateMysteryAiAnswer } from "@/lib/mystery-box-ai-answer";
import { resolveKnownMysteryAnswer } from "@/lib/mystery-box-rules";
import { mysteryUncertainAnswer, questionGameAiError } from "@/lib/question-game-ai-errors";
import {
  fallbackStoryDiceAnswerReview,
  generateStoryDiceAnswerReview,
} from "@/lib/question-game-story-answer-review";
import {
  applyQuestionGameRunAction,
  isMysteryQuestionResolutionRequired,
  isStoryDiceAnswerReviewRequired,
  QuestionGameRunError,
} from "@/lib/question-game-run-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const actorId = await authenticatedQuestionGameActorId();
  if (typeof actorId !== "string") return actorId;
  const limited = checkRateLimit(`question-game-run-action:${actorId}`, 120);
  if (limited) return limited;

  try {
    const { id } = await params;
    const body = await readQuestionGameRunBody(req);
    let result = await applyQuestionGameRunAction(
      actorId,
      id,
      body,
    );
    if (isMysteryQuestionResolutionRequired(result)) {
      let providerResolution = resolveKnownMysteryAnswer(result.resolution);
      try {
        if (!providerResolution) {
          const aiLimited = checkRateLimit(`question-game-mystery-answer:${actorId}`, 20);
          if (aiLimited) return aiLimited;
          providerResolution = await generateMysteryAiAnswer(actorId, result.resolution);
        }
      } catch (error) {
        return NextResponse.json(
          questionGameAiError(error, result.resolution.locale),
          { status: 503 },
        );
      }
      if (providerResolution.answer === "unknown") {
        return NextResponse.json(
          mysteryUncertainAnswer(result.resolution.locale),
          { status: 422 },
        );
      }
      result = await applyQuestionGameRunAction(
        actorId,
        id,
        body,
        new Date(),
        {
          ...result.resolution,
          answer: providerResolution.answer,
          ...(providerResolution.evidence
            ? { evidence: providerResolution.evidence }
            : {}),
        },
      );
      if (isMysteryQuestionResolutionRequired(result)) {
        throw new QuestionGameRunError("미스터리 박스 질문 판정을 확정할 수 없습니다", 409);
      }
    }
    if (isStoryDiceAnswerReviewRequired(result)) {
      const reviewRequest = result.resolution;
      const aiLimited = checkRateLimit(`question-game-story-answer:${actorId}`, 20);
      let review;
      if (aiLimited) {
        review = fallbackStoryDiceAnswerReview(reviewRequest);
      } else {
        try {
          review = await generateStoryDiceAnswerReview(actorId, reviewRequest);
        } catch {
          review = fallbackStoryDiceAnswerReview(reviewRequest);
        }
      }
      result = await applyQuestionGameRunAction(
        actorId,
        id,
        body,
        new Date(),
        undefined,
        review,
      );
      if (isStoryDiceAnswerReviewRequired(result)) {
        throw new QuestionGameRunError("이야기 대답 판정을 확정할 수 없습니다", 409);
      }
    }
    return NextResponse.json(result);
  } catch (error) {
    return questionGameRunFailure(error);
  }
}
