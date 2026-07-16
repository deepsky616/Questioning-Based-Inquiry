import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import {
  authenticatedQuestionGameActorId,
  questionGameRunFailure,
} from "@/lib/question-game-run-route";
import { getQuestionGameRunResult } from "@/lib/question-game-run-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const actorId = await authenticatedQuestionGameActorId();
  if (typeof actorId !== "string") return actorId;
  const limited = checkRateLimit(`question-game-run-result:${actorId}`, 120);
  if (limited) return limited;

  try {
    const { id } = await params;
    return NextResponse.json(await getQuestionGameRunResult(actorId, id));
  } catch (error) {
    return questionGameRunFailure(error);
  }
}
