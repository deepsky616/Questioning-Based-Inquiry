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

export function buildStudentCreateData(
  student: StudentInput,
  classInfo: ClassInfo,
  hashedPassword: string
): StudentCreateData {
  return {
    password: hashedPassword,
    name: student.name,
    role: "STUDENT",
    school: classInfo.school,
    grade: classInfo.grade,
    className: classInfo.className,
    studentNumber: student.studentNumber,
  };
}

export function partitionStudents(
  students: StudentInput[],
  classInfo: ClassInfo,
  existingStudentNumbers: Set<string>
): BulkPartition {
  const toCreate: StudentCreateData[] = [];
  let skippedCount = 0;

  for (const s of students) {
    if (existingStudentNumbers.has(s.studentNumber)) {
      skippedCount++;
    } else {
      toCreate.push(buildStudentCreateData(s, classInfo, ""));
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
