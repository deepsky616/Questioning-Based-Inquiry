// teacher-questions 페이지와 하위 컴포넌트가 공유하는 세션 타입
export interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  createdAt?: string;
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
  sharedQuestions?: Array<{ type: string; content: string; contentGroup?: string; source?: "student" | "teacher"; priority?: number; mergedFrom?: string[]; publishedAt?: string }>;
}

// 질문 조회 탭의 질문 한 건 (페이지·다이얼로그 공유)
export interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  sessionId: string | null;
  session: { id: string; date: string; subject: string; topic: string } | null;
  author: { id: string; name: string; className?: string; grade?: string; studentNumber?: string };
  isPublic: boolean;
  flagged?: boolean;
  flagReason?: string;
  createdAt: string;
  comments?: Array<{ id: string; content: string; author: { id?: string; name: string }; createdAt: string; flagged?: boolean; flagReason?: string }>;
  likeCount: number;
  myLike?: boolean;
  commentCount?: number;
  hasFlaggedComment?: boolean;
  likedBy?: Array<{ id: string; name: string }>;
}

export interface QuestionClassificationSummary {
  total: number;
  closure: { closed: number; open: number };
  cognitive: { factual: number; conceptual: number; controversial: number };
  flagged: number;
}

export interface QuestionPageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TeacherQuestionPageResponse {
  items: Question[];
  pageInfo: QuestionPageInfo;
  summary: QuestionClassificationSummary;
}

// AI 답변 미리보기 한 건 (전송 전 교사 확인 플로우)
export interface BulkPreview {
  questionId: string;
  questionContent: string;
  authorName: string;
  authorInfo: string;
  answer: string;
}
