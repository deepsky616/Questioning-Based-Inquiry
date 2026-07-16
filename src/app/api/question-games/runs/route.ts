import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";
import {
  authenticatedQuestionGameActorId,
  questionGameRunFailure,
  readQuestionGameRunBody,
} from "@/lib/question-game-run-route";
import { createQuestionGameRun } from "@/lib/question-game-run-service";

export async function POST(req: Request) {
  const actorId = await authenticatedQuestionGameActorId();
  if (typeof actorId !== "string") return actorId;
  const limited = checkRateLimit(`question-game-run-create:${actorId}`, 10);
  if (limited) return limited;

  try {
    const result = await createQuestionGameRun(actorId, await readQuestionGameRunBody(req));
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return questionGameRunFailure(error);
  }
}
