export interface StudentActivitySummarySource {
  questionCount: number;
  commentCount: number;
  totalPoints: number;
}

export interface StudentActivitySummary {
  studentCount: number;
  totalQuestions: number;
  totalAnswers: number;
  totalPoints: number;
  averagePoints: number;
}

export interface StudentManagementSearchSource {
  name: string;
  studentNumber: string;
  grade: string;
  className: string;
}

function compactSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
}

export function matchesStudentManagementSearch(
  student: StudentManagementSearchSource,
  query: string,
): boolean {
  const compactQuery = compactSearchText(query);
  if (!compactQuery) return true;

  const candidates = [
    student.name,
    student.studentNumber,
    student.grade,
    student.className,
    `${student.grade}학년${student.className}반`,
    `grade${student.grade}class${student.className}`,
    `${student.grade}-${student.className}`,
    `${student.grade}${student.className}`,
  ];

  return candidates.some((candidate) =>
    compactSearchText(candidate).includes(compactQuery),
  );
}

export function summarizeStudentActivity(
  students: StudentActivitySummarySource[],
): StudentActivitySummary {
  const totals = students.reduce(
    (summary, student) => ({
      totalQuestions: summary.totalQuestions + student.questionCount,
      totalAnswers: summary.totalAnswers + student.commentCount,
      totalPoints: summary.totalPoints + student.totalPoints,
    }),
    { totalQuestions: 0, totalAnswers: 0, totalPoints: 0 },
  );

  return {
    studentCount: students.length,
    ...totals,
    averagePoints:
      students.length === 0
        ? 0
        : Math.round(totals.totalPoints / students.length),
  };
}
