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
      role: true,
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });

  if (teacher?.role !== "TEACHER" || !teacher.school) return null;
  return { school: teacher.school, classes: teacher.teacherClasses };
}

export async function lockAndLoadTeacherStudentScope(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "user">,
  teacherId: string,
): Promise<TeacherStudentScope | null> {
  const lockedTeacher = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "users"
      WHERE "id" = ${teacherId}
      ORDER BY "id"
      FOR UPDATE
    `,
  );
  if (lockedTeacher.length === 0) return null;

  await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "teacher_classes"
      WHERE "teacher_id" = ${teacherId}
      ORDER BY "id"
      FOR UPDATE
    `,
  );

  const teacher = await tx.user.findUnique({
    where: { id: teacherId },
    select: {
      role: true,
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });
  if (teacher?.role !== "TEACHER" || !teacher.school) return null;
  return { school: teacher.school, classes: teacher.teacherClasses };
}

export async function lockStudentRows(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  studentIds: string[],
): Promise<Array<{ id: string }>> {
  const sortedIds = Array.from(new Set(studentIds)).sort();
  if (sortedIds.length === 0) return [];
  return tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "users"
      WHERE "id" IN (${Prisma.join(sortedIds)})
      ORDER BY "id"
      FOR UPDATE
    `,
  );
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
