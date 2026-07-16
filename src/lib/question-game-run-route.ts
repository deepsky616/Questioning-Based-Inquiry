import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { QuestionGameRunError } from "@/lib/question-game-run-service";

const QUESTION_GAME_RUN_BODY_BYTES = 8 * 1024;

export async function authenticatedQuestionGameActorId(): Promise<string | NextResponse> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  return id;
}

export function questionGameRunFailure(error: unknown) {
  if (error instanceof QuestionGameRunError) {
    return NextResponse.json(
      { error: error.message, ...error.details },
      { status: error.status },
    );
  }
  return NextResponse.json(
    { error: "질문놀이 실행을 처리할 수 없습니다" },
    { status: 500 },
  );
}

export async function readQuestionGameRunBody(req: Request): Promise<unknown> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (Number.isFinite(bytes) && bytes > QUESTION_GAME_RUN_BODY_BYTES) {
      throw new QuestionGameRunError("요청 본문이 너무 큽니다", 413);
    }
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > QUESTION_GAME_RUN_BODY_BYTES) {
    throw new QuestionGameRunError("요청 본문이 너무 큽니다", 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new QuestionGameRunError("요청 본문이 올바르지 않습니다", 400);
  }
}
