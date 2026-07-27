import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { studentCanAccessSession } from "@/lib/session-access";
import { normalizeStudentLearningGuides } from "@/lib/student-learning-guide";
import {
  normalizeAchievements,
  withAchievementGuideFallback,
} from "@/lib/student-achievement-reference";

type Params = { params: Promise<{ id: string }> };

// "탐구질문 수업" 세션이 참조하는 탐구설계 맥락을 학생 질문하기 참고자료에 반환한다.
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const user = session.user as { id: string; role?: string };

  const qs = await prisma.questionSession.findUnique({
    where: { id },
    select: {
      unitDesignId: true, date: true, teacherId: true,
      targetType: true, targetGrade: true, targetClassName: true, targetStudentId: true, targetStudentIds: true,
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

  // 권한: 교사는 본인 소유 세션, 학생은 세션 대상일 때만 참고자료를 볼 수 있다.
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
      title: string;
      subject: string;
      grade_range: string;
      grade: string | null;
      area: string;
      core_idea: string;
      selected_achievements: unknown;
      core_sentences: unknown;
      essential_questions: unknown;
      inquiry_questions: unknown;
      learning_guides: unknown;
    }[]
  >`
    SELECT title, subject, grade_range, grade, area, core_idea,
           selected_achievements, core_sentences, essential_questions, inquiry_questions, learning_guides
    FROM unit_designs
    WHERE id = ${qs.unitDesignId} AND teacher_id = ${qs.teacherId}
    LIMIT 1
  `;
  const d = rows[0];
  if (!d) return NextResponse.json({ context: null });

  const asArray = (v: unknown) => (Array.isArray(v) ? v : []);
  const achievements = normalizeAchievements(d.selected_achievements);
  const learningGuides = withAchievementGuideFallback(
    normalizeStudentLearningGuides(d.learning_guides),
    achievements,
    d.grade_range,
    d.subject,
    d.area,
  );
  return NextResponse.json({
    context: {
      id: qs.unitDesignId,
      title: d.title,
      sessionDate: qs.date,
      subject: d.subject,
      gradeRange: d.grade_range,
      grade: d.grade,
      area: d.area,
      coreIdea: d.core_idea,
      achievements,
      coreSentences: asArray(d.core_sentences) as string[],
      essentialQuestions: asArray(d.essential_questions) as string[],
      learningGuides,
      inquiryQuestions: asArray(d.inquiry_questions) as { type: string; content: string }[],
    },
  });
}
