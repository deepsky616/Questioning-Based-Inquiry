import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inspectQuestionGameSettlements } from "@/lib/question-game-settlement-repair";

async function teacherId() {
  const session = await auth();
  if (!session?.user) return { error: "로그인이 필요합니다", status: 401 } as const;
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return { error: "교사만 접근할 수 있습니다", status: 403 } as const;
  }
  return { id: (session.user as { id: string }).id } as const;
}

export async function GET() {
  const actor = await teacherId();
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }
  return NextResponse.json(await inspectQuestionGameSettlements({
    teacherId: actor.id,
    repair: false,
  }));
}

export async function POST() {
  const actor = await teacherId();
  if ("error" in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }
  return NextResponse.json(await inspectQuestionGameSettlements({
    teacherId: actor.id,
    repair: true,
  }));
}
