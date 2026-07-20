export interface StudentInput {
  studentNumber: string;
  name: string;
}

export interface ClassInfo {
  school: string;
  grade: string;
  className: string;
}

export interface StudentCreateData {
  password: string;
  name: string;
  role: "STUDENT";
  school: string;
  grade: string;
  className: string;
  studentNumber: string;
}

export interface BulkPartition {
  toCreate: StudentCreateData[];
  skippedCount: number;
}

export interface BulkResultInput {
  created: number;
  skipped: number;
  errors: string[];
}

export const STUDENT_REGISTRATION_LIMITS = {
  batchSize: 100,
  school: 100,
  grade: 20,
  className: 30,
  studentNumber: 20,
  name: 50,
} as const;

export function normalizeStudentInput(student: StudentInput): StudentInput {
  return {
    studentNumber: student.studentNumber.trim(),
    name: student.name.trim(),
  };
}

export function normalizeClassInfo(classInfo: ClassInfo): ClassInfo {
  return {
    school: classInfo.school.trim(),
    grade: classInfo.grade.trim(),
    className: classInfo.className.trim(),
  };
}

export function normalizeStudentIdentity(
  identity: ClassInfo & Pick<StudentInput, "studentNumber">,
): ClassInfo & Pick<StudentInput, "studentNumber"> {
  return {
    ...normalizeClassInfo(identity),
    studentNumber: identity.studentNumber.trim(),
  };
}

export function buildStudentCreateData(
  student: StudentInput,
  classInfo: ClassInfo,
  hashedPassword: string
): StudentCreateData {
  const normalizedStudent = normalizeStudentInput(student);
  const normalizedClass = normalizeClassInfo(classInfo);
  return {
    password: hashedPassword,
    name: normalizedStudent.name,
    role: "STUDENT",
    school: normalizedClass.school,
    grade: normalizedClass.grade,
    className: normalizedClass.className,
    studentNumber: normalizedStudent.studentNumber,
  };
}

export function partitionStudents(
  students: StudentInput[],
  classInfo: ClassInfo,
  existingStudentNumbers: Set<string>
): BulkPartition {
  const toCreate: StudentCreateData[] = [];
  let skippedCount = 0;
  const seenNumbers = new Set(
    Array.from(existingStudentNumbers, (studentNumber) => studentNumber.trim()),
  );

  for (const student of students) {
    const normalizedStudent = normalizeStudentInput(student);
    if (seenNumbers.has(normalizedStudent.studentNumber)) {
      skippedCount++;
    } else {
      seenNumbers.add(normalizedStudent.studentNumber);
      toCreate.push(buildStudentCreateData(normalizedStudent, classInfo, ""));
    }
  }

  return { toCreate, skippedCount };
}

export function formatBulkResult({ created, skipped, errors }: BulkResultInput): string {
  const parts = [`생성: ${created}명`, `건너뜀: ${skipped}명`];
  if (errors.length > 0) {
    parts.push(`실패: ${errors.length}건`);
  }
  return parts.join(", ");
}
