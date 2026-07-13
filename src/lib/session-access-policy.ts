import type { Prisma } from "@prisma/client";
import { sessionTargetsStudent } from "@/lib/session-targeting";

export interface SessionTargetRecord {
  targetType: string;
  targetGrade: string | null;
  targetClassName: string | null;
  targetStudentId: string | null;
  targetStudentIds: unknown;
}

export interface SessionAccessRecord extends SessionTargetRecord {
  teacherId: string;
  teacher: {
    school: string | null;
    teacherClasses: Array<{ grade: string; className: string }>;
  };
}

export interface SessionStudent {
  id: string;
  role: string;
  school: string | null;
  grade: string | null;
  className: string | null;
}

export function studentCanAccessSession(
  session: SessionAccessRecord,
  student: SessionStudent,
): boolean {
  if (
    student.role !== "STUDENT" ||
    !student.school ||
    !student.grade ||
    !student.className ||
    session.teacher.school !== student.school
  ) {
    return false;
  }

  const classes = session.teacher.teacherClasses;
  const teacherManagesStudent =
    classes.length === 0 ||
    classes.some(
      (item) =>
        item.grade === student.grade && item.className === student.className,
    );

  return teacherManagesStudent && sessionTargetsStudent(session, student);
}

export function sessionWhereForStudent(
  student: SessionStudent,
): Prisma.QuestionSessionWhereInput | null {
  if (
    student.role !== "STUDENT" ||
    !student.school ||
    !student.grade ||
    !student.className
  ) {
    return null;
  }

  return {
    teacher: {
      school: student.school,
      OR: [
        {
          teacherClasses: {
            some: { grade: student.grade, className: student.className },
          },
        },
        { teacherClasses: { none: {} } },
      ],
    },
    OR: [
      { targetType: "ALL" },
      {
        targetType: "CLASS",
        targetGrade: student.grade,
        targetClassName: student.className,
      },
      { targetType: "STUDENT", targetStudentId: student.id },
      {
        targetType: { in: ["CLASS", "STUDENT", "CUSTOM"] },
        targetStudentIds: { array_contains: student.id },
      },
    ],
  };
}
