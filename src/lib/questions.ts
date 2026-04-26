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

export interface QuestionWhereClause {
  authorId?: string;
  isPublic?: boolean;
  closure?: string;
  cognitive?: string;
  content?: { contains: string; mode: "insensitive" };
  sessionId?: string | null;
}

export function buildQuestionCreateData(
  data: CreateQuestionInput,
  authorId: string
): QuestionCreateData {
  return {
    content: data.content,
    context: data.context,
    closure: data.closure ?? "open",
    cognitive: data.cognitive ?? "factual",
    closureScore: data.closureScore ?? 0.5,
    cognitiveScore: data.cognitiveScore ?? 0.5,
    isPublic: data.isPublic ?? false,
    authorId,
    ...(data.sessionId ? { sessionId: data.sessionId } : {}),
  };
}

export function buildQuestionWhereClause(params: {
  authorId?: string | null;
  isPublic?: string | null;
  closure?: string | null;
  cognitive?: string | null;
  search?: string | null;
  sessionId?: string | null;
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

  return where;
}
