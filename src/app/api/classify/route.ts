import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { classifyQuestion } from "@/lib/gemini";
import { z } from "zod";

const classifySchema = z.object({
  content: z.string().min(10).max(500),
  context: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = classifySchema.parse(body);

    const result = await classifyQuestion(data.content, data.context);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    console.error("Classification error:", error);
    return NextResponse.json({ error: "분류 중 오류가 발생했습니다" }, { status: 500 });
  }
}