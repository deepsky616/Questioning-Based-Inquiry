import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const saveSchema = z.object({
  title: z.string().min(1),
  curriculumAreaId: z.string().optional(),
  subject: z.string(),
  gradeRange: z.string(),
  area: z.string(),
  coreIdea: z.string(),
  selectedKeywords: z.array(z.string()),
  coreSentences: z.array(z.string()),
  essentialQuestions: z.array(z.string()),
  inquiryQuestions: z.array(z.object({ type: z.string(), content: z.string() })),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacherId = (session.user as { id: string }).id;
  const designs = await prisma.$queryRaw<
    { id: string; title: string; subject: string; grade_range: string; area: string; created_at: Date }[]
  >`
    SELECT id, title, subject, grade_range, area, created_at
    FROM unit_designs
    WHERE teacher_id = ${teacherId}
    ORDER BY created_at DESC
  `;

  return NextResponse.json(
    designs.map((d) => ({
      id: d.id, title: d.title, subject: d.subject,
      gradeRange: d.grade_range, area: d.area, createdAt: d.created_at,
    }))
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") return NextResponse.json({ error: "교사만 사용할 수 있습니다" }, { status: 403 });

  try {
    const body = await req.json();
    const data = saveSchema.parse(body);
    const teacherId = (session.user as { id: string }).id;

    // 단원 설계 저장 (ID를 RETURNING으로 회수)
    const inserted = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO unit_designs
         (id, teacher_id, curriculum_area_id, title, subject, grade_range, area,
          core_idea, selected_keywords, core_sentences, essential_questions, inquiry_questions,
          created_at, updated_at)
       VALUES
         (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6,
          $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
          now(), now())
       RETURNING id`,
      teacherId,
      data.curriculumAreaId ?? null,
      data.title,
      data.subject,
      data.gradeRange,
      data.area,
      data.coreIdea,
      JSON.stringify(data.selectedKeywords),
      JSON.stringify(data.coreSentences),
      JSON.stringify(data.essentialQuestions),
      JSON.stringify(data.inquiryQuestions)
    );

    const designId = inserted[0]?.id ?? null;

    // 탐구 질문이 있으면 수업 세션 자동 생성
    let sessionId: string | null = null;
    if (designId && data.inquiryQuestions.length > 0) {
      // UTC 기준이 아닌 KST(+9h) 기준 오늘 날짜 사용
      const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const qs = await prisma.questionSession.create({
        data: {
          date: today,
          subject: data.subject,
          topic: data.title,
          teacherId,
          unitDesignId: designId,
        },
      });
      sessionId = qs.id;
    }

    return NextResponse.json({ ok: true, sessionId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    console.error("unit-design save error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
