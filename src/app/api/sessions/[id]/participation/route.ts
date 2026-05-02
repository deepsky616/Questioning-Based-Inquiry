import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. 인증 확인
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. 교사 권한 확인
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json(
      { error: "교사만 참여 현황을 조회할 수 있습니다" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const teacherId = (session.user as { id?: string }).id as string;

  // 3. 세션 조회
  const questionSession = await prisma.questionSession.findUnique({
    where: { id },
  });

  if (!questionSession) {
    return NextResponse.json(
      { error: "세션을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 4. 본인 세션만 조회 가능
  if (questionSession.teacherId !== teacherId) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  try {
    // 5. 해당 교사의 담당 학급 조회
    const teacher = await prisma.user.findUnique({
      where: { id: teacherId },
      select: {
        teacherClasses: {
          select: { grade: true, className: true },
        },
      },
    });

    const classes = teacher?.teacherClasses ?? [];

    // 6. 담당 학급에 속한 모든 학생 조회
    const students = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        OR:
          classes.length > 0
            ? classes.map((c) => ({ grade: c.grade, className: c.className }))
            : [{ id: "" }], // 담당 학급이 없으면 결과 없음
      },
      select: {
        id: true,
        name: true,
        grade: true,
        className: true,
        studentNumber: true,
      },
      orderBy: [{ grade: "asc" }, { className: "asc" }, { studentNumber: "asc" }],
    });

    // 7. 해당 세션의 모든 질문 조회
    const questions = await prisma.question.findMany({
      where: { sessionId: id },
      select: { authorId: true, content: true },
    });

    // 8. 질문을 제출한 학생 ID Set 생성
    const submittedIds = new Set(questions.map((q) => q.authorId));

    // 9. 학생 목록에 hasQuestion 및 questionContent 추가
    const studentList = students.map((s) => ({
      ...s,
      hasQuestion: submittedIds.has(s.id),
      questionContent:
        questions.find((q) => q.authorId === s.id)?.content?.slice(0, 50) ??
        null,
    }));

    // 10. 응답 반환
    return NextResponse.json({
      sessionId: id,
      totalStudents: students.length,
      submittedCount: submittedIds.size,
      students: studentList,
    });
  } catch (error) {
    console.error("Participation fetch error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
