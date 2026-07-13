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

export interface TeacherQuestionViewState {
  session: string;
  date: string;
  subject: string;
  topic: string;
  closure: "all" | "closed" | "open";
  cognitive: "all" | "factual" | "conceptual" | "controversial";
  flagged: boolean;
  search: string;
  sort: "student" | "comment" | "like";
  dir: "asc" | "desc";
  page: number;
  tab: "questions" | "design";
}

export const DEFAULT_TEACHER_QUESTION_VIEW: TeacherQuestionViewState = {
  session: "all",
  date: "",
  subject: "",
  topic: "",
  closure: "all",
  cognitive: "all",
  flagged: false,
  search: "",
  sort: "student",
  dir: "asc",
  page: 1,
  tab: "questions",
};

export function resolveTeacherQuestionSessionSelection({
  selectedSessionId,
  sessionIds,
  filteredSessionIds,
}: {
  selectedSessionId: string;
  sessionIds: string[];
  filteredSessionIds: string[];
}): string | null {
  if (selectedSessionId === "all") return null;
  if (!sessionIds.includes(selectedSessionId) || filteredSessionIds.length === 0) return "all";
  if (!filteredSessionIds.includes(selectedSessionId)) return filteredSessionIds[0];
  return null;
}

export function runWhenTeacherQuestionScopeCurrent(
  requestScope: string,
  getCurrentScope: () => string,
  run: () => void,
  revisionGuard?: {
    requestRevision: string | number;
    getCurrentRevision: () => string | number;
  },
): boolean {
  if (requestScope !== getCurrentScope()) return false;
  if (
    revisionGuard &&
    revisionGuard.requestRevision !== revisionGuard.getCurrentRevision()
  ) return false;
  run();
  return true;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function positivePage(value: string | null): number {
  const normalized = value?.trim() ?? "";
  if (!/^\d+$/.test(normalized)) return 1;
  const page = Number(normalized);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function parseTeacherQuestionViewState(
  params: URLSearchParams,
): TeacherQuestionViewState {
  return {
    session: params.get("session")?.trim() || "all",
    date: params.get("date")?.trim() ?? "",
    subject: params.get("subject")?.trim() ?? "",
    topic: params.get("topic")?.trim() ?? "",
    closure: oneOf(params.get("closure"), ["all", "closed", "open"] as const, "all"),
    cognitive: oneOf(
      params.get("cognitive"),
      ["all", "factual", "conceptual", "controversial"] as const,
      "all",
    ),
    flagged: params.get("flagged") === "1",
    search: params.get("search")?.trim() ?? "",
    sort: oneOf(params.get("sort"), ["student", "comment", "like"] as const, "student"),
    dir: oneOf(params.get("dir"), ["asc", "desc"] as const, "asc"),
    page: positivePage(params.get("page")),
    tab: oneOf(params.get("tab"), ["questions", "design"] as const, "questions"),
  };
}

export function buildTeacherQuestionViewPath(state: TeacherQuestionViewState): string {
  const params = new URLSearchParams();
  if (state.session !== "all") params.set("session", state.session);
  if (state.date) params.set("date", state.date);
  if (state.subject) params.set("subject", state.subject);
  if (state.topic) params.set("topic", state.topic);
  if (state.closure !== "all") params.set("closure", state.closure);
  if (state.cognitive !== "all") params.set("cognitive", state.cognitive);
  if (state.flagged) params.set("flagged", "1");
  if (state.search) params.set("search", state.search);
  if (state.sort !== "student") params.set("sort", state.sort);
  if (state.dir !== "asc") params.set("dir", state.dir);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.tab !== "questions") params.set("tab", state.tab);
  const query = params.toString();
  return query ? `/teacher-questions?${query}` : "/teacher-questions";
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
