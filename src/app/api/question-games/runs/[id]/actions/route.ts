import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import {
  authenticatedQuestionGameActorId,
  questionGameRunFailure,
  readQuestionGameRunBody,
} from "@/lib/question-game-run-route";
import { generateMysteryAiAnswer } from "@/lib/mystery-box-ai-answer";
import {
  applyQuestionGameRunAction,
  isMysteryQuestionResolutionRequired,
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
      const aiLimited = checkRateLimit(`question-game-mystery-answer:${actorId}`, 20);
      if (aiLimited) return aiLimited;
      let providerResolution;
      try {
        providerResolution = await generateMysteryAiAnswer(actorId, result.resolution);
      } catch {
        return NextResponse.json(
          { error: "미스터리 박스 질문 판정을 잠시 처리할 수 없습니다. 다시 시도해 주세요" },
          { status: 503 },
        );
      }
      if (providerResolution.answer === "unknown") {
        return NextResponse.json(
          {
            error: "예 또는 아니오로 답할 수 있게 질문을 다시 써 주세요",
            mysteryRewriteRequired: true,
          },
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
    return NextResponse.json(result);
  } catch (error) {
    return questionGameRunFailure(error);
  }
}
