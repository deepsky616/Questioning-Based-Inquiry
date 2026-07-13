export interface SessionTargetStudent {
  id: string;
  name: string;
  grade: string;
  className: string;
  studentNumber: string;
}

export interface SessionTargetClass {
  grade: string;
  className: string;
}

export const SUBJECTS_BY_GRADE_RANGE: Record<string, string[]> = {
  "1-2": ["국어", "수학", "바른 생활", "슬기로운 생활", "즐거운 생활"],
  "3-4": ["국어", "사회", "도덕", "수학", "과학", "체육", "음악", "미술", "영어"],
  "5-6": ["국어", "사회", "도덕", "수학", "과학", "실과", "체육", "음악", "미술", "영어"],
};

export const ALL_ELEMENTARY_SUBJECTS = Array.from(
  new Set(Object.values(SUBJECTS_BY_GRADE_RANGE).flat()),
);

export function getGradeRange(grade?: string | null): string | null {
  const normalized = String(grade ?? "").replace(/[^0-9]/g, "");
  if (normalized === "1" || normalized === "2") return "1-2";
  if (normalized === "3" || normalized === "4") return "3-4";
  if (normalized === "5" || normalized === "6") return "5-6";
  return null;
}

export function getSubjectsForGrade(grade?: string | null): string[] {
  const range = getGradeRange(grade);
  return range ? SUBJECTS_BY_GRADE_RANGE[range] : ALL_ELEMENTARY_SUBJECTS;
}

export function buildClassTargetValue(targetClass: SessionTargetClass): string {
  return `class:${targetClass.grade}:${targetClass.className}`;
}

/**
 * 배포 대상 기본값 — 담당 학급이 여러 개면 전체 담당 학급(모든 학생),
 * 한 개뿐이면 그 학급(그 학급 전체 학생)을 선택한다.
 */
export function defaultTargetSelection(
  students: SessionTargetStudent[],
  classes: SessionTargetClass[],
): { targetClassValue: string; selectedStudentIds: string[] } {
  if (classes.length === 1) {
    const only = classes[0];
    return {
      targetClassValue: buildClassTargetValue(only),
      selectedStudentIds: students
        .filter((s) => s.grade === only.grade && s.className === only.className)
        .map((s) => s.id),
    };
  }
  return { targetClassValue: "all", selectedStudentIds: students.map((s) => s.id) };
}

export function buildStudentTargetValue(student: SessionTargetStudent): string {
  return `student:${student.id}`;
}

export function getTargetGrade(
  targetValue: string,
  classes: SessionTargetClass[],
  students: SessionTargetStudent[],
): string {
  if (targetValue.startsWith("class:")) {
    const [, grade, className] = targetValue.split(":");
    return classes.find((targetClass) => targetClass.grade === grade && targetClass.className === className)?.grade ?? "";
  }
  if (targetValue.startsWith("student:")) {
    const [, studentId] = targetValue.split(":");
    return students.find((student) => student.id === studentId)?.grade ?? "";
  }
  return "";
}

export function buildSessionTargetPayload(targetValue: string) {
  if (targetValue.startsWith("class:")) {
    const [, grade, className] = targetValue.split(":");
    return { targetType: "CLASS", targetGrade: grade, targetClassName: className, targetStudentId: null };
  }
  if (targetValue.startsWith("student:")) {
    const [, studentId] = targetValue.split(":");
    return { targetType: "STUDENT", targetGrade: null, targetClassName: null, targetStudentId: studentId };
  }
  return { targetType: "ALL", targetGrade: null, targetClassName: null, targetStudentId: null };
}

export function buildClassStudentTargetPayload(params: {
  targetClassValue: string;
  selectedStudentIds: string[];
  students: SessionTargetStudent[];
}) {
  if (params.targetClassValue === "all") {
    return {
      targetType: "ALL",
      targetGrade: null,
      targetClassName: null,
      targetStudentId: null,
      targetStudentIds: [],
    };
  }

  const [, grade, className] = params.targetClassValue.split(":");
  const classStudents = params.students.filter(
    (student) => student.grade === grade && student.className === className,
  );
  const selectedIds = params.selectedStudentIds.filter((id) =>
    classStudents.some((student) => student.id === id),
  );

  if (selectedIds.length === classStudents.length) {
    return {
      targetType: "CLASS",
      targetGrade: grade,
      targetClassName: className,
      targetStudentId: null,
      targetStudentIds: selectedIds,
    };
  }

  if (selectedIds.length === 1) {
    return {
      targetType: "STUDENT",
      targetGrade: grade,
      targetClassName: className,
      targetStudentId: selectedIds[0],
      targetStudentIds: selectedIds,
    };
  }

  return {
    targetType: "CUSTOM",
    targetGrade: grade,
    targetClassName: className,
    targetStudentId: null,
    targetStudentIds: selectedIds,
  };
}

export function buildClassSelectionLabel(params: {
  targetClassValue: string;
  selectedStudentIds: string[];
  students: SessionTargetStudent[];
}) {
  if (params.targetClassValue === "all") {
    return `전체 담당 학급(${params.students.length}/${params.students.length})`;
  }
  const [, grade, className] = params.targetClassValue.split(":");
  const classStudents = params.students.filter(
    (student) => student.grade === grade && student.className === className,
  );
  const selectedCount = params.selectedStudentIds.filter((id) =>
    classStudents.some((student) => student.id === id),
  ).length;
  return `${grade}학년 ${className}반(${selectedCount}/${classStudents.length})`;
}

export function buildTargetLabel(params: {
  targetType?: string | null;
  targetGrade?: string | null;
  targetClassName?: string | null;
  targetStudentName?: string | null;
}) {
  if (params.targetType === "CLASS" && params.targetGrade && params.targetClassName) {
    return `${params.targetGrade}학년 ${params.targetClassName}반`;
  }
  if (params.targetType === "STUDENT") {
    return params.targetStudentName ? `학생 ${params.targetStudentName}` : "개별 학생";
  }
  if (params.targetType === "CUSTOM" && params.targetGrade && params.targetClassName) {
    return `${params.targetGrade}학년 ${params.targetClassName}반 일부`;
  }
  return "전체 담당 학급";
}

interface SessionTarget {
  targetType: string;
  targetGrade: string | null;
  targetClassName: string | null;
  targetStudentId: string | null;
  targetStudentIds: unknown;
}

interface TargetStudent {
  id: string;
  grade: string | null;
  className: string | null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function sessionTargetsStudent(
  session: SessionTarget,
  student: TargetStudent,
): boolean {
  const targetStudentIds = stringArray(session.targetStudentIds);
  if (session.targetType === "ALL") return true;
  if (session.targetType === "CLASS") {
    const classMatches = Boolean(
      session.targetGrade &&
      session.targetClassName &&
      student.grade &&
      student.className &&
      session.targetGrade === student.grade &&
      session.targetClassName === student.className,
    );
    return (
      classMatches ||
      targetStudentIds.includes(student.id)
    );
  }
  if (session.targetType === "STUDENT") {
    return (
      session.targetStudentId === student.id ||
      targetStudentIds.includes(student.id)
    );
  }
  if (session.targetType === "CUSTOM") {
    return targetStudentIds.includes(student.id);
  }
  return false;
}
