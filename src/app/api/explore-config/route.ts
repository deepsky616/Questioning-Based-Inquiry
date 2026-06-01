import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  EXPLORE_CONFIG_DEFAULT, resolveStudentExploreConfig,
} from "@/lib/explore-config";

// 학생: 본인 담당 교사들의 설정을 합쳐서 반환 (AND 정책)
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const role = (session.user as { role?: string }).role;

  if (role !== "STUDENT") {
    return NextResponse.json(EXPLORE_CONFIG_DEFAULT);
  }
  const cfg = await resolveStudentExploreConfig(prisma, userId);
  return NextResponse.json(cfg);
}
