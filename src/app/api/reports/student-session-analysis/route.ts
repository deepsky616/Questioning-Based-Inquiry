import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { AiKeyMissingError } from "@/lib/ai";
import { runStudentSessionAnalysis } from "@/lib/student-session-analysis";
import { requireTeacherSession } from "@/lib/session-helpers";
import { sessionTargetsStudent } from "@/lib/session-targeting";
import {
  isStudentInTeacherScope,
  loadTeacherStudentScope,
} from "@/lib/teacher-student-access";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
});

// 한 수업 세션에서 한 학생의 질문·좋아요·댓글 활동을 AI가 분석(저장 포함)
// POST body: { sessionId, studentId? }  — 분석 생성은 교사만, 학생은 저장된 결과를 보기만 함
export async function POST(req: NextRequest) {
  const authResult = requireTeacherSession(await auth());
  if (!authResult.ok) return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  const userId = authResult.user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  const { sessionId, studentId: targetId } = parsed.data;

  const limited = checkRateLimit(`student-session-analysis:${userId}`, 15);
  if (limited) return limited;

  try {
    const [questionSession, teacherScope, targetStudent] = await Promise.all([
      prisma.questionSession.findUnique({
        where: { id: sessionId },
        select: {
          teacherId: true,
          targetType: true,
          targetGrade: true,
          targetClassName: true,
          targetStudentId: true,
          targetStudentIds: true,
        },
      }),
      loadTeacherStudentScope(userId),
      prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, role: true, school: true, grade: true, className: true },
      }),
    ]);
    if (
      questionSession?.teacherId !== userId ||
      !teacherScope ||
      !targetStudent ||
      !isStudentInTeacherScope(teacherScope, targetStudent) ||
      !sessionTargetsStudent(questionSession, targetStudent)
    ) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const res = await runStudentSessionAnalysis({ studentId: targetId, sessionId, req });
    if (!res) return NextResponse.json({ error: "이 수업에서 한 활동이 없어요" }, { status: 400 });
    return NextResponse.json({ ...res.result, totals: res.totals });
  } catch (error) {
    if (error instanceof AiKeyMissingError) {
      return NextResponse.json({ error: "AI 설정이 필요합니다. 선생님께 API 키 설정을 요청하세요." }, { status: 400 });
    }
    logger.error("student session analysis error:", error);
    return NextResponse.json({ error: "AI 분석에 실패했습니다" }, { status: 500 });
  }
}
