import type { StudentInquiryGuide } from "@/lib/student-inquiry-guide";
import type { StudentLearningGuides } from "@/lib/student-learning-guide";

export interface SharedQuestion {
  type: string;
  content: string;
  studentGuide?: StudentInquiryGuide;
  contentGroup?: string;
  priority?: number;
  source?: "student" | "teacher";
  mergedFrom?: string[];
}

export interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  teacher: { name: string };
  sharedQuestions: SharedQuestion[];
  unitDesignId?: string | null;
  defaultQuestionPublic?: boolean;
}

export interface StudentQuestion {
  sessionId?: string | null;
}

export interface DesignContext {
  title: string;
  subject: string;
  gradeRange: string;
  grade: string | null;
  area: string;
  coreIdea: string;
  coreSentences: string[];
  essentialQuestions: string[];
  learningGuides?: StudentLearningGuides;
  inquiryQuestions: { type: string; content: string; studentGuide?: StudentInquiryGuide }[];
}

export interface ClassificationResult {
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  reasoning: string;
  feedback?: string;
  improvedExample?: string;
  inappropriate?: boolean;
  inappropriateReason?: string;
  analysisSource?: "ai" | "fallback";
  analysisModel?: string;
  fallbackReason?: "missing-key" | "quota" | "busy" | "invalid-response";
}

export type AskTaskScope = "today-unasked" | "future-unasked" | "past-unasked" | "shared" | null;
