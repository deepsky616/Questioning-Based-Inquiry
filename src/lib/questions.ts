import { normalizeSessionDate } from "@/lib/sessions";

// 질문 목록 조회 상한 — 누적된 전체 조회가 무한정 커지지 않도록 최근 N건 기준으로 자른다.
// 서버(take)와 클라이언트(잘림 안내 표시 기준)가 같은 값을 공유한다.
export const QUESTION_LIST_MAX = 500;

export interface CreateQuestionInput {
  content: string;
  context?: string;
  isPublic?: boolean;
  closure?: string;
  cognitive?: string;
  closureScore?: number;
  cognitiveScore?: number;
  sessionId?: string;
}

export interface QuestionCreateData {
  content: string;
  context?: string;
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  isPublic: boolean;
  authorId: string;
  sessionId?: string;
}

export interface SessionWhereFilter {
  date?: string;
  subject?: { contains: string; mode: "insensitive" };
  topic?: { contains: string; mode: "insensitive" };
}

export interface QuestionWhereClause {
  authorId?: string;
  isPublic?: boolean;
  closure?: string;
  cognitive?: string;
  content?: { contains: string; mode: "insensitive" };
  sessionId?: string | null;
  session?: SessionWhereFilter;
}

export function buildSessionWhereFilter(params: {
  date: string | null;
  subject: string | null;
  topic: string | null;
}): SessionWhereFilter | undefined {
  const filter: SessionWhereFilter = {};
  const date = normalizeSessionDate(params.date);
  if (date) filter.date = date;
  if (params.subject?.trim()) filter.subject = { contains: params.subject.trim(), mode: "insensitive" };
  if (params.topic?.trim()) filter.topic = { contains: params.topic.trim(), mode: "insensitive" };
  return Object.keys(filter).length > 0 ? filter : undefined;
}

export function buildQuestionCreateData(
  data: CreateQuestionInput,
  authorId: string,
  options: { defaultIsPublic?: boolean } = {}
): QuestionCreateData {
  return {
    content: data.content,
    context: data.context,
    closure: data.closure ?? "open",
    cognitive: data.cognitive ?? "factual",
    closureScore: data.closureScore ?? 0.5,
    cognitiveScore: data.cognitiveScore ?? 0.5,
    isPublic: options.defaultIsPublic ?? false,
    authorId,
    ...(data.sessionId ? { sessionId: data.sessionId } : {}),
  };
}

export function validateBulkFeedback(questionIds: string[], content: string): string | null {
  if (questionIds.length === 0) return "질문을 1개 이상 선택해 주세요";
  if (!content.trim()) return "피드백 내용을 입력해 주세요";
  return null;
}

export function validateBulkAiRequest(questionIds: string[]): string | null {
  if (questionIds.length === 0) return "질문을 1개 이상 선택해 주세요";
  return null;
}

export function formatBulkAiSummary(success: number, total: number): string {
  const failed = total - success;
  if (failed === 0) return `${success}개 질문에 AI 답변을 전송했습니다`;
  return `${success}개 성공, ${failed}개 실패`;
}

export function countQuestionsWithComments(
  questions: Array<{ comments?: Array<unknown> }>
): number {
  return questions.filter((q) => (q.comments?.length ?? 0) > 0).length;
}

export function validatePreviewAnswers(
  previews: Array<{ questionId: string; answer: string }>
): string | null {
  if (previews.length === 0) return "생성된 답변이 없습니다";
  if (previews.some((p) => !p.answer.trim())) return "비어있는 답변이 있습니다. 확인 후 전송해 주세요";
  return null;
}

export function canCreateComment(role: string | null | undefined, isPublic: boolean): boolean {
  if (role === "TEACHER") return true;
  if (role === "STUDENT" && isPublic) return true;
  return false;
}

/** 학생 본인이 질문 내용을 다듬을 때 수정할 수 있는 필드(재분류 결과 포함) */
const STUDENT_EDITABLE_FIELDS = ["content", "closure", "cognitive", "closureScore", "cognitiveScore"];

export function canPatchQuestion(
  role: string | null | undefined,
  userId: string,
  authorId: string,
  fields: string[]
): boolean {
  if (role === "TEACHER") return true;
  if (role === "STUDENT" && userId === authorId) {
    // 본인 질문: 내용·분류(재분류 결과)만 수정 가능(공개 여부·플래그는 교사 전용)
    return fields.every((f) => STUDENT_EDITABLE_FIELDS.includes(f));
  }
  return false;
}

export function resolveIsPublicFilter(
  role: string | null | undefined,
  requested: string | null
): string | null {
  if (role === "TEACHER") return null;
  return requested ?? null;
}

export function buildQuestionWhereClause(params: {
  authorId?: string | null;
  isPublic?: string | null;
  closure?: string | null;
  cognitive?: string | null;
  search?: string | null;
  sessionId?: string | null;
  date?: string | null;
  subject?: string | null;
  topic?: string | null;
}): QuestionWhereClause {
  const where: QuestionWhereClause = {};

  if (params.authorId) {
    where.authorId = params.authorId;
  }

  if (params.isPublic === "true") {
    where.isPublic = true;
  }

  if (params.closure) {
    where.closure = params.closure;
  }

  if (params.cognitive) {
    where.cognitive = params.cognitive;
  }

  if (params.search) {
    where.content = { contains: params.search, mode: "insensitive" };
  }

  if (params.sessionId === "none") {
    where.sessionId = null;
  } else if (params.sessionId && params.sessionId !== "all") {
    where.sessionId = params.sessionId;
  }

  const sessionFilter = buildSessionWhereFilter({
    date: params.date ?? null,
    subject: params.subject ?? null,
    topic: params.topic ?? null,
  });
  if (sessionFilter) {
    where.session = sessionFilter;
  }

  return where;
}
