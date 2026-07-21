import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  isQuestionGameHistoryCursor,
  loadQuestionGameClassSummary,
  loadQuestionGameHistoryPage,
  loadQuestionGameLearningHistory,
} from "@/lib/question-game-history-service";
import { isBuiltInQuestionGameId } from "@/lib/question-game-rules";
import type { QuestionGameHistoryMode } from "@/lib/question-game-history";
import {
  isClassInTeacherScope,
  isStudentInTeacherScope,
  loadTeacherStudentScope,
} from "@/lib/teacher-student-access";

const HISTORY_MODES = new Set<QuestionGameHistoryMode>(["solo", "ai", "friend"]);

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  const user = session.user as { id: string; role?: string };
  if (user.role !== "STUDENT" && user.role !== "TEACHER") {
    return NextResponse.json({ error: "조회 권한이 없습니다" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const summaryRequested = params.get("summary") === "1";
  const grade = params.get("grade")?.trim() || undefined;
  const className = params.get("className")?.trim() || undefined;
  const requestedId = params.get("studentId")?.trim() || undefined;
  if (user.role === "STUDENT" && requestedId && requestedId !== user.id) {
    return NextResponse.json({ error: "본인의 이력만 조회할 수 있습니다" }, { status: 403 });
  }
  if (grade || className) {
    if (user.role !== "TEACHER") {
      return NextResponse.json({ error: "교사만 학급 이력을 조회할 수 있습니다" }, { status: 403 });
    }
    if (!summaryRequested || !grade || !className || requestedId) {
      return NextResponse.json({ error: "학급 요약 조회 조건이 올바르지 않습니다" }, { status: 400 });
    }
    if (grade.length > 20 || className.length > 20) {
      return NextResponse.json({ error: "학년 또는 반 정보가 올바르지 않습니다" }, { status: 400 });
    }
    const scope = await loadTeacherStudentScope(user.id);
    if (!scope || !isClassInTeacherScope(scope, grade, className)) {
      return NextResponse.json({ error: "학급 이력 조회 권한이 없습니다" }, { status: 403 });
    }
    const students = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        school: scope.school,
        grade,
        className,
      },
      select: { id: true },
    });
    return NextResponse.json(
      await loadQuestionGameClassSummary(students.map(({ id }) => id)),
    );
  }

  const studentId = user.role === "TEACHER" ? requestedId : user.id;
  if (!studentId) {
    return NextResponse.json({ error: "학생을 선택해 주세요" }, { status: 400 });
  }

  if (user.role === "TEACHER") {
    const scope = await loadTeacherStudentScope(user.id);
    if (!scope) {
      return NextResponse.json({ error: "학생 이력 조회 권한이 없습니다" }, { status: 403 });
    }
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { role: true, school: true, grade: true, className: true },
    });
    if (!student || student.role !== "STUDENT") {
      return NextResponse.json({ error: "학생을 찾을 수 없습니다" }, { status: 404 });
    }
    if (!isStudentInTeacherScope(scope, student)) {
      return NextResponse.json({ error: "학생 이력 조회 권한이 없습니다" }, { status: 403 });
    }
  }

  if (summaryRequested) {
    return NextResponse.json(await loadQuestionGameLearningHistory(studentId));
  }

  const modeValue = params.get("mode")?.trim() || undefined;
  const mode = modeValue && HISTORY_MODES.has(modeValue as QuestionGameHistoryMode)
    ? modeValue as QuestionGameHistoryMode
    : undefined;
  if (modeValue && !mode) {
    return NextResponse.json({ error: "올바르지 않은 놀이 방식입니다" }, { status: 400 });
  }
  const gameId = params.get("gameId")?.trim() || undefined;
  if (gameId && !isBuiltInQuestionGameId(gameId)) {
    return NextResponse.json({ error: "올바르지 않은 질문놀이입니다" }, { status: 400 });
  }
  const limitValue = params.get("limit");
  const limit = limitValue === null ? 8 : Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    return NextResponse.json({ error: "한 번에 1개부터 20개까지 조회할 수 있습니다" }, { status: 400 });
  }
  const cursor = params.get("cursor")?.trim() || undefined;
  if (!isQuestionGameHistoryCursor(cursor)) {
    return NextResponse.json({ error: "올바르지 않은 이력 위치입니다" }, { status: 400 });
  }

  const page = await loadQuestionGameHistoryPage({
    studentId,
    ...(mode ? { mode } : {}),
    ...(gameId ? { gameId } : {}),
    limit,
    ...(cursor ? { cursor } : {}),
  });
  return NextResponse.json(page);
}
