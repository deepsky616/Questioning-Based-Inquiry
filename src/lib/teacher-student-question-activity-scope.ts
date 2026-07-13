export type QuestionActivityFilter = "attention" | "noQuestions";

interface SearchParamsReader {
  get(name: string): string | null;
}

interface SearchParamsSnapshot extends SearchParamsReader {
  toString(): string;
}

export interface TeacherClassScope {
  grade: string;
  className: string;
}

export function readQuestionActivityScope(searchParams: SearchParamsReader) {
  const rawFilter = searchParams.get("filter");
  const filter: QuestionActivityFilter | null =
    rawFilter === "attention" || rawFilter === "noQuestions" ? rawFilter : null;
  const period = searchParams.get("period") ?? "month";
  const rawGrade = searchParams.get("grade");
  const rawClassName = searchParams.get("className");
  const hasSpecificClass = Boolean(rawGrade && rawClassName);
  const grade = hasSpecificClass ? rawGrade : null;
  const className = hasSpecificClass ? rawClassName : null;
  const statsParams = new URLSearchParams({ view: "student-activity", period });

  if (grade && className) {
    statsParams.set("grade", grade);
    statsParams.set("className", className);
  }

  return {
    filter,
    enabled: filter !== null,
    period,
    grade,
    className,
    filterClass: grade && className ? `${grade}-${className}` : "all",
    queryKey: [
      "teacher-students-question-activity-filter",
      period,
      grade,
      className,
    ] as const,
    statsPath: `/api/stats?${statsParams.toString()}`,
  };
}

export function buildQuestionActivityScopeHref(
  searchParams: SearchParamsSnapshot,
  nextClass: TeacherClassScope | null,
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete("grade");
  nextParams.delete("className");

  if (nextClass) {
    nextParams.set("grade", nextClass.grade);
    nextParams.set("className", nextClass.className);
  }

  const query = nextParams.toString();
  return query ? `/teacher-students?${query}` : "/teacher-students";
}
