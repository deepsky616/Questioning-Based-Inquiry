import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  isClassInTeacherScope,
  isStudentInTeacherScope,
  loadTeacherStudentScope,
  studentWhereForTeacherScope,
  type TeacherStudentScope,
} from "@/lib/teacher-student-access";
import type { SessionTargetRecord } from "@/lib/session-access-policy";

export {
  sessionWhereForStudent,
  studentCanAccessSession,
  type SessionAccessRecord,
  type SessionStudent,
  type SessionTargetRecord,
} from "@/lib/session-access-policy";

function stringIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))]
    : [];
}

export function studentWhereForSessionTarget(
  scope: TeacherStudentScope,
  session: SessionTargetRecord,
): Prisma.UserWhereInput | null {
  const base = studentWhereForTeacherScope(scope);
  const listedIds = stringIds(session.targetStudentIds);

  if (session.targetType === "ALL") return base;
  if (session.targetType === "CLASS") {
    if (
      !session.targetGrade ||
      !session.targetClassName ||
      !isClassInTeacherScope(scope, session.targetGrade, session.targetClassName)
    ) {
      return null;
    }
    return {
      AND: [
        base,
        {
          OR: [
            { grade: session.targetGrade, className: session.targetClassName },
            ...(listedIds.length > 0 ? [{ id: { in: listedIds } }] : []),
          ],
        },
      ],
    };
  }

  const targetIds = stringIds([
    ...(session.targetStudentId ? [session.targetStudentId] : []),
    ...listedIds,
  ]);
  if (
    (session.targetType !== "STUDENT" && session.targetType !== "CUSTOM") ||
    targetIds.length === 0
  ) {
    return null;
  }
  return { AND: [base, { id: { in: targetIds } }] };
}

export async function teacherCanUseSessionTarget(
  teacherId: string,
  target: SessionTargetRecord,
): Promise<boolean> {
  const scope = await loadTeacherStudentScope(teacherId);
  if (!scope) return false;

  if (target.targetType === "ALL") return true;
  if (target.targetType === "CLASS") {
    if (
      !target.targetGrade ||
      !target.targetClassName ||
      !isClassInTeacherScope(scope, target.targetGrade, target.targetClassName)
    ) {
      return false;
    }
  } else if (target.targetType !== "STUDENT" && target.targetType !== "CUSTOM") {
    return false;
  }

  const targetIds = stringIds([
    ...(target.targetStudentId ? [target.targetStudentId] : []),
    ...stringIds(target.targetStudentIds),
  ]);
  if (target.targetType === "STUDENT" && targetIds.length === 0) return false;
  if (target.targetType === "CUSTOM" && targetIds.length === 0) return false;
  if (targetIds.length === 0) return true;

  const students = await prisma.user.findMany({
    where: { id: { in: targetIds } },
    select: { id: true, role: true, school: true, grade: true, className: true },
  });
  if (students.length !== targetIds.length) return false;
  if (!students.every((student) => isStudentInTeacherScope(scope, student))) return false;

  if (target.targetType === "CLASS") {
    return students.every(
      (student) =>
        student.grade === target.targetGrade &&
        student.className === target.targetClassName,
    );
  }
  if (target.targetType === "STUDENT" && target.targetStudentId) {
    return targetIds.every((studentId) => studentId === target.targetStudentId);
  }
  return true;
}

export async function teacherOwnsUnitDesign(
  teacherId: string,
  unitDesignId: string | null | undefined,
): Promise<boolean> {
  if (!unitDesignId) return true;
  const design = await prisma.unitDesign.findFirst({
    where: { id: unitDesignId, teacherId },
    select: { id: true },
  });
  return Boolean(design);
}
