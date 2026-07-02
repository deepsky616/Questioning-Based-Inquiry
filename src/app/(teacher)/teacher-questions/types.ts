// teacher-questions 페이지와 하위 컴포넌트가 공유하는 세션 타입
export interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  teacher: { name: string };
  unitDesignId?: string | null;
  defaultQuestionPublic?: boolean;
  likesVisibleToPeers?: boolean;
  commentsVisibleToPeers?: boolean;
  isActive?: boolean;
  sharedQuestions?: Array<{ type: string; content: string; contentGroup?: string; source?: "student" | "teacher"; priority?: number }>;
}
