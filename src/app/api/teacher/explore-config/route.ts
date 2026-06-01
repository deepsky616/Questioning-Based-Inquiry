import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  EXPLORE_CONFIG_KEY, EXPLORE_CONFIG_DEFAULT, parseExploreConfig,
} from "@/lib/explore-config";

// 교사 본인의 질문탐구 설정 조회
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const rec = await prisma.systemConfig.findUnique({
    where: { key: EXPLORE_CONFIG_KEY(teacherId) },
  });
  return NextResponse.json(parseExploreConfig(rec?.value));
}

// 교사 본인의 질문탐구 설정 저장
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role !== "TEACHER") return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  const teacherId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => ({}));
  const config = {
    likesEnabled: typeof body.likesEnabled === "boolean" ? body.likesEnabled : EXPLORE_CONFIG_DEFAULT.likesEnabled,
    commentsEnabled: typeof body.commentsEnabled === "boolean" ? body.commentsEnabled : EXPLORE_CONFIG_DEFAULT.commentsEnabled,
  };

  await prisma.systemConfig.upsert({
    where: { key: EXPLORE_CONFIG_KEY(teacherId) },
    update: { value: JSON.stringify(config) },
    create: { key: EXPLORE_CONFIG_KEY(teacherId), value: JSON.stringify(config) },
  });

  return NextResponse.json(config);
}
