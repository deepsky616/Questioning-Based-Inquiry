import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isValidSessionDateString } from "@/lib/sessions";
import { z } from "zod";
import { studentLearningGuidesSchema } from "@/lib/student-learning-guide-schema";

type Params = { params: Promise<{ id: string }> };

const sessionDateSchema = z.string().trim().refine(isValidSessionDateString);

const studentGuideSchema = z.object({
  meaning: z.string().max(500),
  keywords: z.array(z.object({
    term: z.string().max(80),
    meaning: z.string().max(240),
  })).max(5),
  thinkingStart: z.string().max(500),
});

const inquiryQuestionSchema = z.object({
  type: z.string(),
  content: z.string(),
  id: z.string().optional(),
  source: z.enum(["student", "teacher"]).optional(),
  contentGroup: z.string().optional(),
  priority: z.number().optional(),
  lessonPhase: z.string().optional(),
  rationale: z.string().optional(),
  studentGuide: studentGuideSchema.optional(),
}).passthrough();

const achievementSchema = z.object({
  code: z.string().trim().max(80),
  content: z.string().trim().max(1000),
});

// 부분 업데이트: 보낸 필드만 갱신(나머지 필드 보존). 호출자가 전체 객체를 갖고 있지 않아도 안전.
const updateSchema = z.object({
  title: z.string().min(1).optional(),
  subject: z.string().optional(),
  gradeRange: z.string().optional(),
  area: z.string().optional(),
  coreIdea: z.string().optional(),
  achievements: z.array(achievementSchema).max(30).optional(),
  selectedKeywords: z.array(z.string()).optional(),
  coreSentences: z.array(z.string()).optional(),
  essentialQuestions: z.array(z.string()).optional(),
  inquiryQuestions: z.array(inquiryQuestionSchema).optional(),
  learningGuides: studentLearningGuidesSchema.nullable().optional(),
  grade: z.string().nullable().optional(),
  sessionDate: sessionDateSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  defaultQuestionPublic: z.boolean().optional(),
  likesVisibleToPeers: z.boolean().optional(),
  commentsVisibleToPeers: z.boolean().optional(),
  targetClassValue: z.string().optional(),
  targetStudentIds: z.array(z.string()).optional(),
});

async function assertOwner(id: string, teacherId: string) {
  const rows = await prisma.$queryRaw<{ teacher_id: string }[]>`
    SELECT teacher_id FROM unit_designs WHERE id = ${id} LIMIT 1
  `;
  return rows[0]?.teacher_id === teacherId;
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 사용할 수 있습니다" }, { status: 403 });
  }

  try {
    const teacherId = (session.user as { id: string }).id;
    const { id } = await params;
    if (!(await assertOwner(id, teacherId))) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const data = updateSchema.parse(await req.json());
    const sets: string[] = [];
    const vals: unknown[] = [];
    const add = (col: string, val: unknown, cast = "") => {
      vals.push(val);
      sets.push(`${col} = $${vals.length}${cast}`);
    };
    if (data.title !== undefined) add("title", data.title);
    if (data.subject !== undefined) add("subject", data.subject);
    if (data.gradeRange !== undefined) add("grade_range", data.gradeRange);
    if (data.area !== undefined) add("area", data.area);
    if (data.coreIdea !== undefined) add("core_idea", data.coreIdea);
    if (data.achievements !== undefined) add("selected_achievements", JSON.stringify(data.achievements), "::jsonb");
    if (data.selectedKeywords !== undefined) add("selected_keywords", JSON.stringify(data.selectedKeywords), "::jsonb");
    if (data.coreSentences !== undefined) add("core_sentences", JSON.stringify(data.coreSentences), "::jsonb");
    if (data.essentialQuestions !== undefined) add("essential_questions", JSON.stringify(data.essentialQuestions), "::jsonb");
    if (data.inquiryQuestions !== undefined) add("inquiry_questions", JSON.stringify(data.inquiryQuestions), "::jsonb");
    if (data.learningGuides !== undefined) add("learning_guides", data.learningGuides ? JSON.stringify(data.learningGuides) : null, "::jsonb");
    if (data.grade !== undefined) add("grade", data.grade);
    if (data.sessionDate !== undefined) add("session_date", data.sessionDate);
    if (data.isActive !== undefined) add("is_active", data.isActive);
    if (data.defaultQuestionPublic !== undefined) add("default_question_public", data.defaultQuestionPublic);
    if (data.likesVisibleToPeers !== undefined) add("likes_visible_to_peers", data.likesVisibleToPeers);
    if (data.commentsVisibleToPeers !== undefined) add("comments_visible_to_peers", data.commentsVisibleToPeers);
    if (data.targetClassValue !== undefined) add("target_class_value", data.targetClassValue);
    if (data.targetStudentIds !== undefined) add("target_student_ids", JSON.stringify(data.targetStudentIds), "::jsonb");
    if (sets.length === 0) {
      const current = await prisma.$queryRaw<{ updated_at: Date }[]>`
        SELECT updated_at FROM unit_designs WHERE id = ${id} LIMIT 1
      `;
      return NextResponse.json({ ok: true, designId: id, updatedAt: current[0]?.updated_at });
    }
    sets.push("updated_at = now()");
    vals.push(id);
    const updated = await prisma.$queryRawUnsafe<{ updated_at: Date }[]>(
      `UPDATE unit_designs SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING updated_at`,
      ...vals,
    );
    return NextResponse.json({ ok: true, designId: id, updatedAt: updated[0]?.updated_at });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const teacherId = (session.user as { id: string }).id;
  const { id } = await params;

  if (!(await assertOwner(id, teacherId))) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  await prisma.$executeRawUnsafe(`DELETE FROM unit_designs WHERE id = $1`, id);
  return NextResponse.json({ ok: true });
}
