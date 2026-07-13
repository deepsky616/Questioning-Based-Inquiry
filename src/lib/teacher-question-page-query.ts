export interface TeacherQuestionPageQueryInput {
  selectedSessionId: string;
  filterDate: string;
  filterSubject: string;
  filterTopic: string;
  filterClosure: "all" | "closed" | "open";
  filterCognitive: "all" | "factual" | "conceptual" | "controversial";
  showFlaggedOnly: boolean;
  search: string;
  sortField: "student" | "comment" | "like";
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export function buildTeacherQuestionPagePath(input: TeacherQuestionPageQueryInput): string {
  const params = new URLSearchParams({
    view: "page",
    page: String(input.page),
    pageSize: String(input.pageSize),
  });
  if (input.selectedSessionId !== "all") {
    params.set("sessionId", input.selectedSessionId);
  } else {
    if (input.filterDate) params.set("date", input.filterDate);
    if (input.filterSubject) params.set("subject", input.filterSubject);
    if (input.filterTopic) params.set("topic", input.filterTopic);
  }
  if (input.filterClosure !== "all") params.set("closure", input.filterClosure);
  if (input.filterCognitive !== "all") params.set("cognitive", input.filterCognitive);
  if (input.showFlaggedOnly) params.set("flagged", "1");
  if (input.search) params.set("search", input.search);
  const sortParam = input.sortField === "student"
    ? "studentSort"
    : input.sortField === "comment"
      ? "commentSort"
      : "likeSort";
  params.set(sortParam, input.sortDir);
  return `/api/questions?${params}`;
}
