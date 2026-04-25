import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { maskApiKey } from "@/lib/api-config";

const saveConfigSchema = z.object({
  apiKey: z.string().min(10),
  model: z.string().min(1),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [apiKeyRecord, modelRecord] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } }),
    prisma.systemConfig.findUnique({ where: { key: "gemini_model" } }),
  ]);

  return NextResponse.json({
    configured: !!apiKeyRecord,
    maskedApiKey: apiKeyRecord ? maskApiKey(apiKeyRecord.value) : null,
    model: modelRecord?.value ?? "gemini-2.0-flash",
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 설정할 수 있습니다" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { apiKey, model } = saveConfigSchema.parse(body);

    await Promise.all([
      prisma.systemConfig.upsert({
        where: { key: "gemini_api_key" },
        update: { value: apiKey },
        create: { key: "gemini_api_key", value: apiKey },
      }),
      prisma.systemConfig.upsert({
        where: { key: "gemini_model" },
        update: { value: model },
        create: { key: "gemini_model", value: model },
      }),
    ]);

    return NextResponse.json({ success: true, model });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    console.error("Config save error:", error);
    return NextResponse.json({ error: "설정 저장에 실패했습니다" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 설정을 삭제할 수 있습니다" }, { status: 403 });
  }

  await prisma.systemConfig.deleteMany({
    where: { key: { in: ["gemini_api_key", "gemini_model"] } },
  });

  return NextResponse.json({ success: true });
}
