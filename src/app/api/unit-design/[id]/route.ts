import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const inquiryQuestionSchema = z.object({
  type: z.string(),
  content: z.string(),
  id: z.string().optional(),
  source: z.enum(["student", "teacher"]).optional(),
  contentGroup: z.string().optional(),
  priority: z.number().optional(),
  lessonPhase: z.string().optional(),
  rationale: z.string().optional(),
}).passthrough();

const updateSchema = z.object({
  title: z.string().min(1),
  subject: z.string(),
  gradeRange: z.string(),
  area: z.string(),
  coreIdea: z.string(),
  selectedKeywords: z.array(z.string()),
  coreSentences: z.array(z.string()),
  essentialQuestions: z.array(z.string()),
  inquiryQuestions: z.array(inquiryQuestionSchema),
});

async function assertOwner(id: string, teacherId: string) {
  const rows = await prisma.$queryRaw<{ teacher_id: string }[]>`
    SELECT teacher_id FROM unit_designs WHERE id = ${id} LIMIT 1
  `;
  return rows[0]?.teacher_id === teacherId;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 사용할 수 있습니다" }, { status: 403 });
  }

  try {
    const teacherId = (session.user as { id: string }).id;
    const { id } = params;
    if (!(await assertOwner(id, teacherId))) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const data = updateSchema.parse(await req.json());
    await prisma.$executeRawUnsafe(
      `UPDATE unit_designs
       SET title = $1, subject = $2, grade_range = $3, area = $4, core_idea = $5,
           selected_keywords = $6::jsonb, core_sentences = $7::jsonb,
           essential_questions = $8::jsonb, inquiry_questions = $9::jsonb,
           updated_at = now()
       WHERE id = $10`,
      data.title,
      data.subject,
      data.gradeRange,
      data.area,
      data.coreIdea,
      JSON.stringify(data.selectedKeywords),
      JSON.stringify(data.coreSentences),
      JSON.stringify(data.essentialQuestions),
      JSON.stringify(data.inquiryQuestions),
      id,
    );
    return NextResponse.json({ ok: true, designId: id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacherId = (session.user as { id: string }).id;
  const { id } = params;

  if (!(await assertOwner(id, teacherId))) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  await prisma.$executeRawUnsafe(`DELETE FROM unit_designs WHERE id = $1`, id);
  return NextResponse.json({ ok: true });
}
