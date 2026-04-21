export type ClosureType = "closed" | "open";
export type CognitiveType = "factual" | "interpretive" | "evaluative";

export interface Question {
  id: string;
  content: string;
  closure: ClosureType;
  cognitive: CognitiveType;
  closureScore: number;
  cognitiveScore: number;
  context?: string;
  authorId: string;
  author?: {
    id: string;
    name: string;
    className?: string;
  };
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  comments?: Comment[];
}

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  author?: {
    id: string;
    name: string;
  };
  questionId: string;
  createdAt: Date;
}

export interface ClassificationResult {
  closure: ClosureType;
  cognitive: CognitiveType;
  closureScore: number;
  cognitiveScore: number;
  reasoning: string;
}