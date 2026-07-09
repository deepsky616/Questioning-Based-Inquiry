import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { saveQuestionGameOrder } from "@/lib/question-game-settings-store";

const schema = z.object({ order: z.array(z.string().min(1)) });

// 교사가 지정한 질문놀이 표시 순서를 저장한다(학생 목록에도 반영됨).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;

  try {
    const { order } = schema.parse(await req.json());
    await saveQuestionGameOrder(teacherId, order);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    return NextResponse.json({ error: "저장에 실패했습니다" }, { status: 500 });
  }
}
