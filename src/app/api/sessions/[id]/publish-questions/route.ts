import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  deletePublishedQuestions,
  getPublishedQuestions,
  publishQuestionsToSession,
  PublishQuestionsError,
} from "@/lib/publish-questions-service";

type Params = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
}

type RouteSession = { user?: { id?: string; role?: string } | null } | null;

function teacherOnly(session: RouteSession) {
  if (!session?.user) return unauthorized();
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  }
  return null;
}

function serviceError(error: unknown) {
  if (error instanceof PublishQuestionsError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
}

export async function GET(
  _req: NextRequest,
  { params }: Params,
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return unauthorized();
  try {
    const data = await getPublishedQuestions(id, (session.user as { id: string }).id);
    return NextResponse.json(data);
  } catch (error) {
    return serviceError(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: Params,
) {
  const { id } = await params;
  const session = await auth();
  const blocked = teacherOnly(session);
  if (blocked) return blocked;
  try {
    const body = await req.json().catch(() => ({}));
    const result = await publishQuestionsToSession(id, (session!.user as { id: string }).id, body);
    return NextResponse.json(result);
  } catch (error) {
    return serviceError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: Params,
) {
  const { id } = await params;
  const session = await auth();
  const blocked = teacherOnly(session);
  if (blocked) return blocked;
  try {
    const body = await req.json().catch(() => ({}));
    const result = await deletePublishedQuestions(id, (session!.user as { id: string }).id, body);
    return NextResponse.json(result);
  } catch (error) {
    return serviceError(error);
  }
}
