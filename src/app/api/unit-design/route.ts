import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

const saveSchema = z.object({
  title: z.string().min(1),
  curriculumAreaId: z.string().optional(),
  subject: z.string(),
  gradeRange: z.string(),
  grade: z.string().optional(),
  sessionDate: z.string().optional(),
  area: z.string(),
  coreIdea: z.string(),
  selectedKeywords: z.array(z.string()),
  coreSentences: z.array(z.string()),
  essentialQuestions: z.array(z.string()),
  inquiryQuestions: z.array(inquiryQuestionSchema),
  isActive: z.boolean().optional().default(true),
  defaultQuestionPublic: z.boolean().optional().default(true),
  likesVisibleToPeers: z.boolean().optional().default(true),
  commentsVisibleToPeers: z.boolean().optional().default(true),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacherId = (session.user as { id: string }).id;
  const designs = await prisma.$queryRaw<
    {
      id: string;
      title: string;
      subject: string;
      grade_range: string;
      grade: string | null;
      session_date: string | null;
      area: string;
      core_idea: string;
      core_sentences: unknown;
      essential_questions: unknown;
      inquiry_questions: unknown;
      is_active: boolean;
      default_question_public: boolean;
      likes_visible_to_peers: boolean;
      comments_visible_to_peers: boolean;
      created_at: Date;
    }[]
  >`
    SELECT id, title, subject, grade_range, grade, session_date, area,
           core_idea, core_sentences, essential_questions, inquiry_questions,
           is_active, default_question_public, likes_visible_to_peers, comments_visible_to_peers, created_at
    FROM unit_designs
    WHERE teacher_id = ${teacherId}
    ORDER BY created_at DESC
  `;

  const asArray = (v: unknown) => (Array.isArray(v) ? v : []);
  return NextResponse.json(
    designs.map((d) => ({
      id: d.id, title: d.title, subject: d.subject,
      gradeRange: d.grade_range, grade: d.grade, sessionDate: d.session_date, area: d.area,
      coreIdea: d.core_idea ?? "",
      coreSentences: asArray(d.core_sentences) as string[],
      essentialQuestions: asArray(d.essential_questions) as string[],
      inquiryQuestions: asArray(d.inquiry_questions),
      isActive: d.is_active,
      defaultQuestionPublic: d.default_question_public,
      likesVisibleToPeers: d.likes_visible_to_peers,
      commentsVisibleToPeers: d.comments_visible_to_peers,
      createdAt: d.created_at,
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

    // 탐구 질문 저장 (ID를 RETURNING으로 회수)
    const inserted = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO unit_designs
         (id, teacher_id, curriculum_area_id, title, subject, grade_range, area,
          core_idea, selected_keywords, core_sentences, essential_questions, inquiry_questions,
          grade, session_date, is_active, default_question_public, likes_visible_to_peers,
          comments_visible_to_peers, created_at, updated_at)
       VALUES
         (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6,
          $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
          $12, $13, $14, $15, $16, $17, now(), now())
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
      JSON.stringify(data.inquiryQuestions),
      data.grade ?? null,
      data.sessionDate ?? null,
      data.isActive,
      data.defaultQuestionPublic,
      data.likesVisibleToPeers,
      data.commentsVisibleToPeers
    );

    const designId = inserted[0]?.id ?? null;

    return NextResponse.json({
      ok: true,
      designId,
      design: designId
        ? {
            id: designId,
            title: data.title,
            subject: data.subject,
            gradeRange: data.gradeRange,
            grade: data.grade ?? null,
            sessionDate: data.sessionDate ?? null,
            area: data.area,
            inquiryQuestions: data.inquiryQuestions,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("unit-design save error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
