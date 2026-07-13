import { ACTIVITY_BONUS_TYPES } from "@/lib/activity-bonus-policy";

// AI 추천 포인트 검토 화면의 공용 타입·라벨 규칙.
// 로직은 usePointReview, 행 렌더링은 PendingRow, 조립은 PointReviewView가 담당.

export const MAX_ANALYZE_SESSIONS = 5;

export interface SessionItem {
  id: string;
  date: string;
  subject: string;
  topic: string;
  targetType?: string | null;
  targetGrade?: string | null;
  targetClassName?: string | null;
  targetStudentId?: string | null;
  targetStudentIds?: string[] | null;
}

export interface PointReviewClassFilter {
  grade: string;
  className: string;
  studentIds?: string[];
}

export interface PendingLog {
  id: string;
  studentId: string;
  studentName: string;
  grade: string | null;
  className: string | null;
  bonusType: string;
  points: number;
  reason: string;
  sessionId: string | null;
  relatedQuestionId: string | null;
  relatedCommentId: string | null;
  questionContent: string;
  questionLikeCount: number | null;
  commentContent: string;
  aiAnalysis: string | null;
  createdAt: string;
  alreadyForTarget: number;
  alreadyInSession: number;
}

export type AnalyzeResponse = {
  createdPending?: number;
  questionCount?: number;
  commentCount?: number;
  aiStatus?: "success" | "skipped" | "failed";
  aiErrorType?: "missing_key" | "busy" | "quota" | "invalid_response" | "unknown" | null;
  fallbackUsed?: boolean;
  error?: string;
};

// 라벨은 번역키(labelKey)로 반환하고 표시 시점에 t로 해석. 미지정 타입은 raw 노출.
export function bonusLabel(bt: string): { labelKey: string | null; raw: string; emoji: string; color: string } {
  const stripped = bt.replace(/^AI_/, "");
  if (stripped in ACTIVITY_BONUS_TYPES) {
    const def = ACTIVITY_BONUS_TYPES[stripped as keyof typeof ACTIVITY_BONUS_TYPES];
    return {
      labelKey: `review_${stripped}`,
      raw: bt,
      emoji: def.emoji,
      // 경고성 판정(중복·불성실)은 빨간색으로 구분
      color: stripped.endsWith("_FLAGGED") ? "#ef4444" : "#6366f1",
    };
  }
  return { labelKey: null, raw: bt, emoji: "🎯", color: "#6366f1" };
}
