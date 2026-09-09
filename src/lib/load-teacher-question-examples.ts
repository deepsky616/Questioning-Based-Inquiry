import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { questionTeachingExamplesForGrades } from "./question-teaching-examples";
import type { TeachingExamplesData } from "./question-teaching-examples-types";

export async function loadTeacherQuestionExamples(): Promise<TeachingExamplesData> {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== "TEACHER") {
      return { status: "unassigned", grades: [], topics: [] };
    }
    const classes = await prisma.teacherClass.findMany({
      where: { teacherId: session.user.id },
      select: { grade: true },
    });
    return questionTeachingExamplesForGrades(classes.map(item => item.grade));
  } catch {
    // 담당 학년 조회에 실패해도 기존 질문학습과 일반 수업 안내는 이용할 수 있다.
    console.error("담당 학년의 질문 수업 예시를 불러오지 못했습니다.");
    return { status: "unavailable", grades: [], topics: [] };
  }
}
