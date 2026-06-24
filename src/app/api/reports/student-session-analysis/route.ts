import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { logger } from "@/lib/logger";
import { AiKeyMissingError } from "@/lib/ai";
import { runStudentSessionAnalysis } from "@/lib/student-session-analysis";

// 한 수업 세션에서 한 학생의 질문·좋아요·댓글 활동을 AI가 분석(저장 포함)
// POST body: { sessionId, studentId? }  — 분석 생성은 교사만, 학생은 저장된 결과를 보기만 함
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id: string }).id;

  // 분석 생성은 교사만 — 키 사용량·결과 일관성 관리
  if (role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 분석을 실행할 수 있습니다" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });
  const targetId = typeof body.studentId === "string" && body.studentId ? body.studentId : userId;

  const limited = checkRateLimit(`student-session-analysis:${userId}`, 15);
  if (limited) return limited;

  try {
    const res = await runStudentSessionAnalysis({ studentId: targetId, sessionId, req });
    if (!res) return NextResponse.json({ error: "이 세션에서 한 활동이 없어요" }, { status: 400 });
    return NextResponse.json({ ...res.result, totals: res.totals });
  } catch (error) {
    if (error instanceof AiKeyMissingError) {
      return NextResponse.json({ error: "AI 설정이 필요합니다. 선생님께 API 키 설정을 요청하세요." }, { status: 400 });
    }
    logger.error("student session analysis error:", error);
    return NextResponse.json({ error: "AI 분석에 실패했습니다" }, { status: 500 });
  }
}
