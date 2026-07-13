import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import {
  createQuestionForUser,
  getStudentDashboardQuestionSummary,
  getStudentSessionQuestion,
  listTeacherQuestionPage,
  listQuestionsForUser,
  QuestionRouteError,
} from "@/lib/question-route-service";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  try {
    const view = new URL(req.url).searchParams.get("view");
    const questions = view === "dashboard"
      ? await getStudentDashboardQuestionSummary(session.user)
      : view === "student-session"
        ? await getStudentSessionQuestion(req, session.user)
        : view === "page"
          ? await listTeacherQuestionPage(req, session.user)
          : await listQuestionsForUser(req, session.user);
    return NextResponse.json(questions);
  } catch (error) {
    if (error instanceof QuestionRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error("List questions error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  try {
    const question = await createQuestionForUser(req, session.user);
    return NextResponse.json(question);
  } catch (error) {
    if (error instanceof QuestionRouteError) {
      return NextResponse.json(
        { error: error.message, ...(error.code ? { code: error.code } : {}) },
        { status: error.status },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Create question error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}
