import { normalizeCognitiveType } from "@/lib/question-labels";

export interface InquiryGraphQuestion {
  id?: string;
  content: string;
  cognitive?: string | null;
  closure?: string | null;
  isPublic?: boolean | null;
}

export interface InquiryGraphSharedQuestion {
  type: string;
  content: string;
}

export interface InquiryGraphSummary {
  sharedQuestionCount: number;
  studentQuestionCount: number;
  publicQuestionCount: number;
  byCognitive: {
    factual: number;
    conceptual: number;
    controversial: number;
  };
  byClosure: {
    closed: number;
    open: number;
  };
  highlights: InquiryGraphQuestion[];
}

export function buildInquiryGraphSummary(
  sharedQuestions: InquiryGraphSharedQuestion[],
  studentQuestions: InquiryGraphQuestion[],
  highlightLimit = 4,
): InquiryGraphSummary {
  const usableSharedQuestions = sharedQuestions.filter((question) => question.content.trim());
  const usableStudentQuestions = studentQuestions.filter((question) => question.content.trim());

  const byCognitive = { factual: 0, conceptual: 0, controversial: 0 };
  const byClosure = { closed: 0, open: 0 };

  for (const question of usableStudentQuestions) {
    byCognitive[normalizeCognitiveType(question.cognitive)]++;
    if (question.closure === "closed") byClosure.closed++;
    else byClosure.open++;
  }

  return {
    sharedQuestionCount: usableSharedQuestions.length,
    studentQuestionCount: usableStudentQuestions.length,
    publicQuestionCount: usableStudentQuestions.filter((question) => question.isPublic).length,
    byCognitive,
    byClosure,
    highlights: usableStudentQuestions.slice(0, highlightLimit),
  };
}
