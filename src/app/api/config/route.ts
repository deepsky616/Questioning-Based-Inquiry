import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { isAllowedGeminiModel, maskApiKey, resolveGeminiModel } from "@/lib/api-config";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";

const saveConfigSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().refine(isAllowedGeminiModel, "지원하지 않는 Gemini 모델입니다"),
});

// 교사: 본인 AI 설정 / 학생: 담당 교사의 설정 적용 여부만 확인
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id: string }).id;

  if (role === "TEACHER") {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { aiApiKey: true, aiModel: true } });
    return NextResponse.json({
      configured: !!me?.aiApiKey,
      maskedApiKey: me?.aiApiKey ? maskApiKey(me.aiApiKey) : null,
      model: resolveGeminiModel(me?.aiModel),
    });
  }

  // 학생: 담당 교사 키가 설정돼 있는지만 알려준다(키는 노출하지 않음)
  const cfg = await resolveUserAiConfig(userId);
  return NextResponse.json({ configured: !!cfg.apiKey, maskedApiKey: null, model: cfg.model });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id: string }).id;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 설정할 수 있습니다" }, { status: 403 });

  try {
    const body = await req.json();
    const { apiKey, model } = saveConfigSchema.parse(body);
    const trimmedApiKey = apiKey?.trim() ?? "";

    const me = await prisma.user.findUnique({ where: { id: userId }, select: { aiApiKey: true } });
    if (!me?.aiApiKey && trimmedApiKey.length < 10) {
      return NextResponse.json({ error: "API 키를 입력해 주세요" }, { status: 400 });
    }
    if (trimmedApiKey && trimmedApiKey.length < 10) {
      return NextResponse.json({ error: "API 키는 10자 이상이어야 합니다" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { aiModel: model, ...(trimmedApiKey ? { aiApiKey: trimmedApiKey } : {}) },
    });

    return NextResponse.json({
      success: true,
      model,
      configured: true,
      maskedApiKey: maskApiKey(trimmedApiKey || me!.aiApiKey!),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0]?.message ?? "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Config save error:", error);
    return NextResponse.json({ error: "설정 저장에 실패했습니다" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id: string }).id;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 설정을 삭제할 수 있습니다" }, { status: 403 });

  await prisma.user.update({ where: { id: userId }, data: { aiApiKey: null, aiModel: null } });
  return NextResponse.json({ success: true });
}
