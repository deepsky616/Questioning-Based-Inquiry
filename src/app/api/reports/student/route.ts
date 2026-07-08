import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildStudentReport } from "@/lib/student-report";

// 학생 활동 리포트: 본인(학생) 또는 교사가 지정한 학생의 질문·좋아요·댓글(쓴 것+받은 것) 추세
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  const userId = (session.user as { id: string }).id;

  const requestedId = req.nextUrl.searchParams.get("studentId");
  const targetId = role === "TEACHER" && requestedId ? requestedId : userId;

  const report = await buildStudentReport(targetId);
  if (!report) {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(report);
}
