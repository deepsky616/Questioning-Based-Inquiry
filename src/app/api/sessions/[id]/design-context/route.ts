import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// "탐구질문 수업" 세션이 참조하는 탐구설계 맥락(핵심아이디어·핵심어·핵심문장·핵심질문·탐구질문)을
// 반환한다. 학생 질문하기의 참고 자료 패널에서 사용. (성취기준은 후속 단계에서 추가)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const user = session.user as { id: string; role?: string; grade?: string; className?: string };

  const qs = await prisma.questionSession.findUnique({
    where: { id: params.id },
    select: {
      unitDesignId: true, date: true, teacherId: true,
      targetType: true, targetGrade: true, targetClassName: true, targetStudentId: true, targetStudentIds: true,
    },
  });
  if (!qs) return NextResponse.json({ context: null });

  // 권한: 교사는 본인 소유 세션, 학생은 세션 대상일 때만 참고자료를 볼 수 있다.
  const targetIds = Array.isArray(qs.targetStudentIds) ? (qs.targetStudentIds as string[]) : [];
  const isOwnerTeacher = user.role === "TEACHER" && qs.teacherId === user.id;
  const isTargetStudent = user.role !== "TEACHER" && (
    qs.targetType === "ALL" ||
    (qs.targetType === "CLASS" && qs.targetGrade === user.grade && qs.targetClassName === user.className) ||
    (qs.targetType === "STUDENT" && qs.targetStudentId === user.id) ||
    (qs.targetType === "CUSTOM" && targetIds.includes(user.id))
  );
  if (!isOwnerTeacher && !isTargetStudent) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  if (!qs.unitDesignId) return NextResponse.json({ context: null });

  const rows = await prisma.$queryRaw<
    {
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
    SELECT title, subject, grade_range, grade, area, core_idea,
           core_sentences, essential_questions, inquiry_questions
    FROM unit_designs WHERE id = ${qs.unitDesignId} LIMIT 1
  `;
  const d = rows[0];
  if (!d) return NextResponse.json({ context: null });

  const asArray = (v: unknown) => (Array.isArray(v) ? v : []);
  return NextResponse.json({
    context: {
      title: d.title,
      sessionDate: qs.date,
      subject: d.subject,
      gradeRange: d.grade_range,
      grade: d.grade,
      area: d.area,
      coreIdea: d.core_idea,
      coreSentences: asArray(d.core_sentences) as string[],
      essentialQuestions: asArray(d.essential_questions) as string[],
      inquiryQuestions: asArray(d.inquiry_questions) as { type: string; content: string }[],
    },
  });
}
