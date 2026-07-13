import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface TeacherStudentScope {
  school: string;
  classes: Array<{ grade: string; className: string }>;
}

export interface StudentScopeTarget {
  role: string;
  school: string | null;
  grade: string | null;
  className: string | null;
}

export async function loadTeacherStudentScope(
  teacherId: string,
): Promise<TeacherStudentScope | null> {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: {
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });

  if (!teacher?.school) return null;
  return { school: teacher.school, classes: teacher.teacherClasses };
}

export function isClassInTeacherScope(
  scope: TeacherStudentScope,
  grade: string | null,
  className: string | null,
): boolean {
  if (scope.classes.length === 0) return true;
  return scope.classes.some(
    (item) => item.grade === grade && item.className === className,
  );
}

export function isStudentInTeacherScope(
  scope: TeacherStudentScope,
  student: StudentScopeTarget,
): boolean {
  return (
    student.role === "STUDENT" &&
    student.school === scope.school &&
    isClassInTeacherScope(scope, student.grade, student.className)
  );
}

export function studentWhereForTeacherScope(
  scope: TeacherStudentScope,
): Prisma.UserWhereInput {
  return scope.classes.length === 0
    ? { role: "STUDENT", school: scope.school }
    : {
        role: "STUDENT",
        school: scope.school,
        OR: scope.classes.map((item) => ({
          grade: item.grade,
          className: item.className,
        })),
      };
}
