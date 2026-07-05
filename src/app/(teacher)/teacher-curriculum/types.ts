// teacher-curriculum 페이지와 하위 컴포넌트가 공유하는 타입·헬퍼

export interface InquiryQuestion {
  type: "factual" | "conceptual" | "controversial";
  content: string;
}

export interface SavedInquiryDesign {
  id: string;
  title: string;
  subject: string;
  gradeRange: string;
  grade?: string | null;
  sessionDate?: string | null;
  area: string;
  coreIdea?: string;
  coreSentences?: string[];
  essentialQuestions?: string[];
  inquiryQuestions: InquiryQuestion[];
  isActive?: boolean;
  defaultQuestionPublic?: boolean;
  likesVisibleToPeers?: boolean;
  commentsVisibleToPeers?: boolean;
  targetClassValue?: string;
  targetStudentIds?: string[];
  sessionCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// 오늘 날짜(YYYY-MM-DD, 로컬 기준)
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
