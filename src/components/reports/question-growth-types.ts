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

export const growthQuestionHref = (questionId: string) => `/student-questions?tab=mine&growth=${encodeURIComponent(questionId)}`;
