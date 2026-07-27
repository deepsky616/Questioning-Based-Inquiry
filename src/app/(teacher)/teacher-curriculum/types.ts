import type { Achievement } from "@/lib/achievement-selection";
import type { StudentInquiryGuide } from "@/lib/student-inquiry-guide";
import type { StudentLearningGuides } from "@/lib/student-learning-guide";

// teacher-curriculum 페이지와 하위 컴포넌트가 공유하는 타입·헬퍼

export interface InquiryQuestion {
  type: "factual" | "conceptual" | "controversial";
  content: string;
  studentGuide?: StudentInquiryGuide;
}

export type LastDesignAction = { type: "saved" | "deployed"; at: string };

export interface SavedInquiryDesign {
  id: string;
  title: string;
  unitTitle?: string;
  subject: string;
  gradeRange: string;
  grade?: string | null;
  sessionDate?: string | null;
  area: string;
  coreIdea?: string;
  achievements?: Achievement[];
  selectedKeywords?: string[];
  coreSentences?: string[];
  essentialQuestions?: string[];
  learningGuides?: StudentLearningGuides;
  inquiryQuestions: InquiryQuestion[];
  isActive?: boolean;
  defaultQuestionPublic?: boolean;
  likesVisibleToPeers?: boolean;
  commentsVisibleToPeers?: boolean;
  targetClassValue?: string;
  targetStudentIds?: string[];
  sessionCount?: number;
  lastDeployedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// 오늘 날짜(YYYY-MM-DD, 로컬 기준)
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface CurriculumUnit {
  unitCode: string;
  unitName: string;
}

export interface CurriculumAchievementGroup {
  name: string;
  achievements: Achievement[];
}

export interface CurriculumArea {
  id: string;
  subject: string;
  gradeRange: string;
  area: string;
  coreIdea: string;
  knowledgeItems: string[];
  processItems: string[];
  valueItems: string[];
  middleKnowledgeItems: string[];
  middleProcessItems: string[];
  middleValueItems: string[];
  achievements: Achievement[];
  units: CurriculumUnit[];
  achievementExplanations?: Record<string, string>;
  achievementConsiderations?: string[];
  achievementGroups?: CurriculumAchievementGroup[];
}

// 내용 요소 표시 한도(1단계 표와 페이지 로직이 공유)
export const KNOWLEDGE_ITEM_LIMIT = 12;
export const PROCESS_ITEM_LIMIT = 12;
export const VALUE_ITEM_LIMIT = 8;
