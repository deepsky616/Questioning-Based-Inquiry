import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/curriculum?subject=과학&gradeRange=3-4
// → 해당 교과·학년군의 영역 목록 또는 특정 영역 데이터
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject");
  const gradeRange = searchParams.get("gradeRange");
  const areaId = searchParams.get("areaId");

  // 특정 영역 단건 반환 — areaId는 전역 고유이므로 가장 먼저 처리
  if (areaId) {
    const row = await prisma.$queryRaw<
      {
        id: string; subject: string; grade_range: string; area: string;
        core_idea: string; knowledge_items: unknown; process_items: unknown;
        value_items: unknown; middle_knowledge_items: unknown;
        middle_process_items: unknown; middle_value_items: unknown;
        achievements: unknown;
      }[]
    >`SELECT * FROM curriculum_areas WHERE id = ${areaId} LIMIT 1`;
    if (!row[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const r = row[0];
    return NextResponse.json({
      id: r.id, subject: r.subject, gradeRange: r.grade_range, area: r.area,
      coreIdea: r.core_idea,
      knowledgeItems: r.knowledge_items,
      processItems: r.process_items,
      valueItems: r.value_items,
      middleKnowledgeItems: r.middle_knowledge_items ?? [],
      middleProcessItems: r.middle_process_items ?? [],
      middleValueItems: r.middle_value_items ?? [],
      achievements: r.achievements,
    });
  }

  // 교과 목록 반환
  if (!subject) {
    const subjects = await prisma.$queryRaw<{ subject: string }[]>`
      SELECT DISTINCT subject FROM curriculum_areas ORDER BY subject
    `;
    return NextResponse.json({ subjects: subjects.map((s) => s.subject) });
  }

  // 학년군 목록 반환
  if (!gradeRange) {
    const grades = await prisma.$queryRaw<{ grade_range: string }[]>`
      SELECT DISTINCT grade_range FROM curriculum_areas
      WHERE subject = ${subject} ORDER BY grade_range
    `;
    return NextResponse.json({ gradeRanges: grades.map((g) => g.grade_range) });
  }

  // 교과·학년군의 영역 목록 반환
  const areas = await prisma.$queryRaw<
    { id: string; area: string; core_idea: string }[]
  >`
    SELECT id, area, core_idea
    FROM curriculum_areas
    WHERE subject = ${subject} AND grade_range = ${gradeRange}
    ORDER BY area
  `;

  return NextResponse.json({
    areas: areas.map((a) => ({ id: a.id, area: a.area, coreIdea: a.core_idea })),
  });
}
