export interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  createdAt?: string;
  teacher: { name: string };
  unitDesignId?: string | null;
  sharedQuestions?: { type: string; content: string }[];
  defaultQuestionPublic: boolean;
  likesVisibleToPeers: boolean;
  commentsVisibleToPeers: boolean;
  isActive: boolean;
  targetType?: string | null;
  targetGrade?: string | null;
  targetClassName?: string | null;
  targetStudentId?: string | null;
  targetStudentIds?: string[];
  targetStudent?: { name: string } | null;
  participation?: {
    total: number;
    submitted: number;
    missing: number;
    percent: number;
  };
}

export interface TeacherSessionForm {
  targetClassValue: string;
  selectedStudentIds: string[];
  date: string;
  subject: string;
  topic: string;
  defaultQuestionPublic: boolean;
  likesVisibleToPeers: boolean;
  commentsVisibleToPeers: boolean;
  isActive: boolean;
}
