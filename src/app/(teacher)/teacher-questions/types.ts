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
  // 배포 대상(수업세션과 동일 구조) — 질문 중심 탐구설계 배포 시 초기값으로 사용
  targetType?: string | null;
  targetGrade?: string | null;
  targetClassName?: string | null;
  targetStudentId?: string | null;
  targetStudentIds?: string[] | null;
  sharedQuestions?: Array<{ type: string; content: string; contentGroup?: string; source?: "student" | "teacher"; priority?: number; mergedFrom?: string[] }>;
}
