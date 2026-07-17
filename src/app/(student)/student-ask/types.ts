import type { StudentInquiryGuide } from "@/lib/student-inquiry-guide";

export interface SharedQuestion {
  type: string;
  content: string;
  studentGuide?: StudentInquiryGuide;
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
}

export type AskTaskScope = "today-unasked" | "future-unasked" | "past-unasked" | "shared" | null;
