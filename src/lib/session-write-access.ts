import { Prisma } from "@prisma/client";
import { lockAccountLifecycles } from "@/lib/account-lifecycle-lock";
import type { SessionTargetRecord } from "@/lib/session-access-policy";
import {
  isClassInTeacherScope,
  isStudentInTeacherScope,
  lockAndLoadTeacherStudentScope,
  lockStudentRows,
} from "@/lib/teacher-student-access";

type Tx = Prisma.TransactionClient;

export type SessionTargetType = "ALL" | "CLASS" | "STUDENT" | "CUSTOM";

export type SessionTargetPatch = {
  targetType?: SessionTargetType;
  targetGrade?: string | null;
  targetClassName?: string | null;
  targetStudentId?: string | null;
  targetStudentIds?: unknown;
};

export type NormalizedSessionTarget = {
  targetType: SessionTargetType;
  targetGrade: string | null;
  targetClassName: string | null;
  targetStudentId: string | null;
  targetStudentIds: string[];
};

function isTargetType(value: unknown): value is SessionTargetType {
  return value === "ALL" || value === "CLASS" || value === "STUDENT" || value === "CUSTOM";
}

function normalizedNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizedStringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )).sort();
}

export function normalizeSessionTarget(
  patch: SessionTargetPatch,
  current?: SessionTargetRecord | null,
): NormalizedSessionTarget {
  const currentType = isTargetType(current?.targetType) ? current.targetType : "ALL";
  const targetType = patch.targetType ?? currentType;
  const targetTypeChanged = Boolean(current && targetType !== currentType);
  const currentIds = normalizedStringIds(current?.targetStudentIds);
  const hasExplicitIds = patch.targetStudentIds !== undefined;
  const explicitIds = hasExplicitIds ? normalizedStringIds(patch.targetStudentIds) : [];

  if (targetType === "ALL") {
    return {
      targetType,
      targetGrade: null,
      targetClassName: null,
      targetStudentId: null,
      targetStudentIds: [],
    };
  }

  if (targetType === "CLASS") {
    const targetGrade = patch.targetGrade !== undefined
      ? normalizedNullableString(patch.targetGrade)
      : targetTypeChanged
        ? null
        : normalizedNullableString(current?.targetGrade);
    const targetClassName = patch.targetClassName !== undefined
      ? normalizedNullableString(patch.targetClassName)
      : targetTypeChanged
        ? null
        : normalizedNullableString(current?.targetClassName);
    const classChanged = targetTypeChanged ||
      (patch.targetGrade !== undefined && targetGrade !== normalizedNullableString(current?.targetGrade)) ||
      (patch.targetClassName !== undefined && targetClassName !== normalizedNullableString(current?.targetClassName));
    return {
      targetType,
      targetGrade,
      targetClassName,
      targetStudentId: null,
      targetStudentIds: hasExplicitIds ? explicitIds : classChanged ? [] : currentIds,
    };
  }

  if (targetType === "STUDENT") {
    const requestedIds = hasExplicitIds ? explicitIds : [];
    const explicitStudentId = patch.targetStudentId !== undefined
      ? normalizedNullableString(patch.targetStudentId)
      : undefined;
    const targetStudentId = explicitStudentId || (hasExplicitIds && requestedIds.length === 1
      ? requestedIds[0]
      : patch.targetStudentId !== undefined || hasExplicitIds || targetTypeChanged
        ? null
        : normalizedNullableString(current?.targetStudentId));
    const containsDifferentExplicitId = Boolean(
      targetStudentId && requestedIds.some((id) => id !== targetStudentId),
    );
    return {
      targetType,
      targetGrade: null,
      targetClassName: null,
      targetStudentId,
      targetStudentIds: targetStudentId && !containsDifferentExplicitId
        ? [targetStudentId]
        : requestedIds,
    };
  }

  const targetGrade = patch.targetGrade !== undefined
    ? normalizedNullableString(patch.targetGrade)
    : targetTypeChanged
      ? null
      : normalizedNullableString(current?.targetGrade);
  const targetClassName = patch.targetClassName !== undefined
    ? normalizedNullableString(patch.targetClassName)
    : targetTypeChanged
      ? null
      : normalizedNullableString(current?.targetClassName);
  const customScopeChanged = targetTypeChanged ||
    (patch.targetGrade !== undefined && targetGrade !== normalizedNullableString(current?.targetGrade)) ||
    (patch.targetClassName !== undefined && targetClassName !== normalizedNullableString(current?.targetClassName));
  return {
    targetType,
    targetGrade,
    targetClassName,
    targetStudentId: null,
    targetStudentIds: hasExplicitIds ? explicitIds : customScopeChanged ? [] : currentIds,
  };
}

export function sessionTargetLifecycleUserIds(target: SessionTargetRecord): string[] {
  return Array.from(new Set([
    ...(target.targetStudentId ? [target.targetStudentId] : []),
    ...normalizedStringIds(target.targetStudentIds),
  ])).sort();
}

export async function lockSessionWriteLifecycles(
  tx: Tx,
  teacherId: string,
  target: SessionTargetRecord,
) {
  const targetStudentIds = sessionTargetLifecycleUserIds(target);
  await lockAccountLifecycles(tx, [teacherId, ...targetStudentIds]);
  return targetStudentIds;
}

export async function revalidateSessionTargetAfterLifecycleLocks(
  tx: Tx,
  teacherId: string,
  target: NormalizedSessionTarget,
) {
  const scope = await lockAndLoadTeacherStudentScope(tx, teacherId);
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

  const targetStudentIds = sessionTargetLifecycleUserIds(target);
  if (
    (target.targetType === "STUDENT" || target.targetType === "CUSTOM") &&
    targetStudentIds.length === 0
  ) {
    return false;
  }
  if (targetStudentIds.length === 0) return true;

  const lockedStudents = await lockStudentRows(tx, targetStudentIds);
  if (lockedStudents.length !== targetStudentIds.length) return false;
  const students = await tx.user.findMany({
    where: { id: { in: targetStudentIds } },
    select: { id: true, role: true, school: true, grade: true, className: true },
    orderBy: { id: "asc" },
  });
  if (
    students.length !== targetStudentIds.length ||
    !students.every((student) => isStudentInTeacherScope(scope, student))
  ) {
    return false;
  }

  if (target.targetType === "CLASS") {
    return students.every(
      (student) =>
        student.grade === target.targetGrade &&
        student.className === target.targetClassName,
    );
  }
  if (target.targetType === "STUDENT") {
    return Boolean(
      target.targetStudentId &&
      targetStudentIds.every((studentId) => studentId === target.targetStudentId),
    );
  }
  return true;
}

export async function lockAndRequireCurrentTeacher(tx: Tx, teacherId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "users"
    WHERE "id" = ${teacherId}
    ORDER BY "id"
    FOR UPDATE
  `);
  if (locked.length !== 1) return false;
  const teacher = await tx.user.findUnique({
    where: { id: teacherId },
    select: { role: true },
  });
  return teacher?.role === "TEACHER";
}

export async function lockUnitDesignOwnership(
  tx: Tx,
  teacherId: string,
  unitDesignId: string | null | undefined,
) {
  if (!unitDesignId) return true;
  const designs = await tx.$queryRaw<Array<{ id: string; teacherId: string }>>(Prisma.sql`
    SELECT "id", "teacher_id" AS "teacherId"
    FROM "unit_designs"
    WHERE "id" = ${unitDesignId}
    ORDER BY "id"
    FOR SHARE
  `);
  return designs.length === 1 && designs[0]?.teacherId === teacherId;
}
