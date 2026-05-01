import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurriculumAchievementDetail } from "@/lib/curriculum-achievement-details";

// ─── GET /api/curriculum/enriched?areaId=xxx ──────────────────────────────────

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const areaId = searchParams.get("areaId");

  if (!areaId) {
    return NextResponse.json(
      { error: "areaId 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  // 1. 기존 curriculum_areas 데이터 조회 (기존 /api/curriculum 라우트와 동일 방식)
  const rows = await prisma.$queryRaw<
    {
      id: string;
      subject: string;
      grade_range: string;
      area: string;
      core_idea: string;
      knowledge_items: unknown;
      process_items: unknown;
      value_items: unknown;
      middle_knowledge_items: unknown;
      middle_process_items: unknown;
      middle_value_items: unknown;
      achievements: unknown;
      units: unknown;
    }[]
  >`SELECT * FROM curriculum_areas WHERE id = ${areaId} LIMIT 1`;

  if (!rows[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const r = rows[0];

  // 2. units 배열에서 unitName 목록 추출
  const units = (r.units as Array<{ unitName?: string; [key: string]: unknown }> | null) ?? [];
  const unitNames: string[] = units
    .map((u) => u.unitName)
    .filter((name): name is string => Boolean(name));

  const areaDetail = getCurriculumAchievementDetail(r.grade_range, r.subject, r.area);

  const unitDetails: Record<
    string,
    {
      explanations: Record<string, string>;
      considerations: string[];
    }
  > = {};

  for (const unitName of unitNames) {
    const detail = getCurriculumAchievementDetail(r.grade_range, r.subject, unitName);
    if (detail) {
      unitDetails[unitName] = {
        explanations: detail.explanations,
        considerations: detail.considerations,
      };
    } else {
      // 단원명이 JSON에 없는 경우 빈 객체 반환 (graceful fallback)
      unitDetails[unitName] = {
        explanations: {},
        considerations: [],
      };
    }
  }

  return NextResponse.json({
    // 기존 curriculum data
    id: r.id,
    subject: r.subject,
    gradeRange: r.grade_range,
    area: r.area,
    coreIdea: r.core_idea,
    knowledgeItems: r.knowledge_items,
    processItems: r.process_items,
    valueItems: r.value_items,
    middleKnowledgeItems: r.middle_knowledge_items ?? [],
    middleProcessItems: r.middle_process_items ?? [],
    middleValueItems: r.middle_value_items ?? [],
    achievements: areaDetail?.achievements ?? r.achievements,
    units,
    achievementExplanations: areaDetail?.explanations ?? {},
    achievementConsiderations: areaDetail?.considerations ?? [],
    achievementGroups: areaDetail?.achievementGroups ?? [],
    // 추가: 단원별 성취기준 해설/고려사항
    unitDetails,
  });
}
