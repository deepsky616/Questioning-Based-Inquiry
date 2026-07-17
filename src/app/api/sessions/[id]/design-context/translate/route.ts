import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { getRequestLocale, DEFAULT_LOCALE } from "@/lib/locale";
import { contentHash, translateTexts } from "@/lib/translate";
import { logger } from "@/lib/logger";
import { studentCanAccessSession } from "@/lib/session-access";
import { normalizeStudentInquiryGuide, type StudentInquiryGuide } from "@/lib/student-inquiry-guide";

type Params = { params: Promise<{ id: string }> };

interface InquiryQuestion {
  type: string;
  content: string;
  studentGuide?: StudentInquiryGuide;
}

interface DesignReferenceContext {
  id: string;
  title: string;
  sessionDate: string;
  subject: string;
  gradeRange: string;
  grade: string | null;
  area: string;
  coreIdea: string;
  coreSentences: string[];
  essentialQuestions: string[];
  inquiryQuestions: InquiryQuestion[];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asInquiryQuestions(value: unknown): InquiryQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as { type?: unknown }).type !== "string" ||
      typeof (item as { content?: unknown }).content !== "string"
    ) return [];
    const question = item as { type: string; content: string; studentGuide?: unknown };
    const studentGuide = normalizeStudentInquiryGuide(question.studentGuide);
    return [{
      type: question.type,
      content: question.content,
      ...(studentGuide ? { studentGuide } : {}),
    }];
  });
}

function buildEntries(context: DesignReferenceContext): [string, string][] {
  const base: [string, string][] = [
    ["title", context.title],
    ["subject", context.subject],
    ["area", context.area],
    ["coreIdea", context.coreIdea],
  ];
  return [
    ...base,
    ...context.coreSentences.map((value, index) => [`coreSentences.${index}`, value] as [string, string]),
    ...context.essentialQuestions.map((value, index) => [`essentialQuestions.${index}`, value] as [string, string]),
    ...context.inquiryQuestions.flatMap((value, index): [string, string][] => {
      const guide = value.studentGuide;
      return [
        [`inquiryQuestions.${index}`, value.content],
        ...(guide?.meaning ? [[`inquiryQuestions.${index}.guide.meaning`, guide.meaning] as [string, string]] : []),
        ...(guide?.keywords.flatMap((keyword, keywordIndex): [string, string][] => [
          [`inquiryQuestions.${index}.guide.keywords.${keywordIndex}.term`, keyword.term],
          [`inquiryQuestions.${index}.guide.keywords.${keywordIndex}.meaning`, keyword.meaning],
        ]) ?? []),
        ...(guide?.thinkingStart ? [[`inquiryQuestions.${index}.guide.thinkingStart`, guide.thinkingStart] as [string, string]] : []),
      ];
    }),
  ].filter(([, value]) => value.trim());
}

function applyTranslations(context: DesignReferenceContext, fields: Record<string, string>): DesignReferenceContext {
  return {
    ...context,
    title: fields.title ?? context.title,
    subject: fields.subject ?? context.subject,
    area: fields.area ?? context.area,
    coreIdea: fields.coreIdea ?? context.coreIdea,
    coreSentences: context.coreSentences.map((value, index) => fields[`coreSentences.${index}`] ?? value),
    essentialQuestions: context.essentialQuestions.map((value, index) => fields[`essentialQuestions.${index}`] ?? value),
    inquiryQuestions: context.inquiryQuestions.map((value, index) => ({
      ...value,
      content: fields[`inquiryQuestions.${index}`] ?? value.content,
      ...(value.studentGuide ? {
        studentGuide: {
          meaning: fields[`inquiryQuestions.${index}.guide.meaning`] ?? value.studentGuide.meaning,
          keywords: value.studentGuide.keywords.map((keyword, keywordIndex) => ({
            term: fields[`inquiryQuestions.${index}.guide.keywords.${keywordIndex}.term`] ?? keyword.term,
            meaning: fields[`inquiryQuestions.${index}.guide.keywords.${keywordIndex}.meaning`] ?? keyword.meaning,
          })),
          thinkingStart: fields[`inquiryQuestions.${index}.guide.thinkingStart`] ?? value.studentGuide.thinkingStart,
        },
      } : {}),
    })),
  };
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const user = session.user as { id: string; role?: string };

  const targetLocale = getRequestLocale(req);
  if (targetLocale === DEFAULT_LOCALE) {
    return NextResponse.json({ context: null });
  }

  const qs = await prisma.questionSession.findUnique({
    where: { id },
    select: {
      unitDesignId: true,
      date: true,
      teacherId: true,
      targetType: true,
      targetGrade: true,
      targetClassName: true,
      targetStudentId: true,
      targetStudentIds: true,
      teacher: {
        select: {
          role: true,
          school: true,
          teacherClasses: { select: { grade: true, className: true } },
        },
      },
    },
  });
  if (!qs) return NextResponse.json({ context: null });

  const isOwnerTeacher = user.role === "TEACHER" && qs.teacherId === user.id;
  const student = !isOwnerTeacher && user.role === "STUDENT"
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, role: true, school: true, grade: true, className: true },
      })
    : null;
  const isTargetStudent = Boolean(student && studentCanAccessSession(qs, student));
  if (!isOwnerTeacher && !isTargetStudent) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }
  if (!qs.unitDesignId) return NextResponse.json({ context: null });

  const rows = await prisma.$queryRaw<
    {
      id: string;
      title: string;
      subject: string;
      grade_range: string;
      grade: string | null;
      area: string;
      core_idea: string;
      core_sentences: unknown;
      essential_questions: unknown;
      inquiry_questions: unknown;
    }[]
  >`
    SELECT id, title, subject, grade_range, grade, area, core_idea,
           core_sentences, essential_questions, inquiry_questions
    FROM unit_designs
    WHERE id = ${qs.unitDesignId} AND teacher_id = ${qs.teacherId}
    LIMIT 1
  `;
  const design = rows[0];
  if (!design) return NextResponse.json({ context: null });

  const context: DesignReferenceContext = {
    id: design.id,
    title: design.title,
    sessionDate: qs.date,
    subject: design.subject,
    gradeRange: design.grade_range,
    grade: design.grade,
    area: design.area,
    coreIdea: design.core_idea,
    coreSentences: asStringArray(design.core_sentences),
    essentialQuestions: asStringArray(design.essential_questions),
    inquiryQuestions: asInquiryQuestions(design.inquiry_questions),
  };
  const entries = buildEntries(context);
  if (entries.length === 0) return NextResponse.json({ context });

  const hash = contentHash(JSON.stringify(entries));
  const cached = await prisma.translation.findUnique({
    where: {
      sourceType_sourceId_targetLocale: {
        sourceType: "DESIGN_REFERENCE",
        sourceId: design.id,
        targetLocale,
      },
    },
  });
  if (cached && cached.sourceHash === hash) {
    try {
      const fields = JSON.parse(cached.content) as Record<string, string>;
      return NextResponse.json({ context: applyTranslations(context, fields) });
    } catch {
      // 깨진 캐시는 아래에서 재생성한다.
    }
  }

  const { success } = rateLimit(`translate:${user.id}`, { limit: 30, windowMs: 60_000 });
  if (!success) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  const aiCfg = await resolveUserAiConfig(user.id);
  if (!aiCfg.apiKey) {
    return NextResponse.json({ error: "AI 설정이 없어 번역할 수 없어요." }, { status: 503 });
  }

  let translated: string[];
  try {
    translated = await translateTexts(entries.map(([, value]) => value), targetLocale, user.id, aiCfg.apiKey, aiCfg.model);
  } catch (error) {
    logger.error("design reference translate failed", error);
    return NextResponse.json({ error: "번역에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 502 });
  }

  const fields = Object.fromEntries(entries.map(([key], index) => [key, translated[index] ?? ""]));
  await prisma.translation.upsert({
    where: {
      sourceType_sourceId_targetLocale: {
        sourceType: "DESIGN_REFERENCE",
        sourceId: design.id,
        targetLocale,
      },
    },
    create: {
      sourceType: "DESIGN_REFERENCE",
      sourceId: design.id,
      targetLocale,
      content: JSON.stringify(fields),
      sourceHash: hash,
    },
    update: {
      content: JSON.stringify(fields),
      sourceHash: hash,
    },
  });

  return NextResponse.json({ context: applyTranslations(context, fields) });
}
