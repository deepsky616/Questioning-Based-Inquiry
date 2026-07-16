import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import {
  authenticatedQuestionGameActorId,
  questionGameRunFailure,
  readQuestionGameRunBody,
} from "@/lib/question-game-run-route";
import { applyQuestionGameRunAction } from "@/lib/question-game-run-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const actorId = await authenticatedQuestionGameActorId();
  if (typeof actorId !== "string") return actorId;
  const limited = checkRateLimit(`question-game-run-action:${actorId}`, 120);
  if (limited) return limited;

  try {
    const { id } = await params;
    const result = await applyQuestionGameRunAction(
      actorId,
      id,
      await readQuestionGameRunBody(req),
    );
    return NextResponse.json(result);
  } catch (error) {
    return questionGameRunFailure(error);
  }
}
