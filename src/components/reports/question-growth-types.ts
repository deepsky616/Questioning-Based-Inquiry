export interface GrowthRecord {
  questionId: string;
  originalContent: string;
  revisedContent: string;
  changeNote?: string;
  reflection: string;
  revision: number;
  updatedAt: string;
}

export interface GrowthResponse {
  questions: Array<{ id: string; content: string; session: { date: string; subject: string; topic: string } | null }>;
  records: GrowthRecord[];
  canEdit: boolean;
}

export interface GrowthJournalResponse {
  records: Array<GrowthRecord & { question: { session: { id: string; date: string; subject: string; topic: string } | null } }>;
  canEdit: boolean;
  pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
  summary: { total: number; complete: number; pending: number };
}

export const growthQuestionHref = (questionId: string) => `/student-questions?tab=mine&growth=${encodeURIComponent(questionId)}`;
