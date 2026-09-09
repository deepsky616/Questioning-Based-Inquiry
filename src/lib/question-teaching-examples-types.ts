export type TeachingText = { ko: string; en: string };
export type TeachingQuestionKind = "closed" | "open" | "conceptual" | "controversial";

export interface TeachingExampleTopic {
  id: string;
  grade: string;
  subject: TeachingText;
  unit: TeachingText;
  setup: TeachingText;
  questions: Record<TeachingQuestionKind, TeachingText>;
  standards: Array<{ code: string; content: string }>;
}

export interface TeachingExamplesData {
  status: "ready" | "unassigned" | "unavailable";
  grades: string[];
  topics: TeachingExampleTopic[];
}
