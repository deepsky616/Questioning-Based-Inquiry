export interface ClassStats {
  total: number;
  byClosure: {
    closed: number;
    open: number;
  };
  byCognitive: {
    factual: number;
    interpretive: number;
    evaluative: number;
  };
  byStudent: StudentStat[];
  timeline: TimelineEntry[];
}

export interface StudentStat {
  studentId: string;
  name: string;
  className?: string;
  total: number;
  distribution: {
    closed: number;
    open: number;
  };
  cognitiveDistribution: {
    factual: number;
    interpretive: number;
    evaluative: number;
  };
  trend: number;
}

export interface TimelineEntry {
  date: string;
  count: number;
}

export interface QuestionFilter {
  authorId?: string;
  isPublic?: boolean;
  closure?: string;
  cognitive?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
}