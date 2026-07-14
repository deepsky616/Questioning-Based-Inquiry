export type LikeSortOrder = "asc" | "desc" | "none";

interface CanLikeInput {
  likerId: string;
  questionAuthorId: string;
  likerRole: string | null | undefined;
  questionAuthorRole?: string | null;
  isPublic?: boolean;
}

type CanLikeResult =
  | { ok: true }
  | { ok: false; reason: string };

export function canLikeQuestion(input: CanLikeInput): CanLikeResult {
  if (input.likerRole !== "STUDENT" && input.likerRole !== "TEACHER") {
    return { ok: false, reason: "좋아요를 표시할 수 없습니다" };
  }
  if (input.likerId === input.questionAuthorId) {
    return { ok: false, reason: "자신의 질문에는 좋아요를 표시할 수 없습니다" };
  }
  if (input.likerRole === "TEACHER" && input.questionAuthorRole !== "STUDENT") {
    return { ok: false, reason: "학생 질문에만 좋아요를 표시할 수 있습니다" };
  }
  if (input.likerRole === "STUDENT" && input.isPublic === false) {
    return { ok: false, reason: "공개 질문에만 좋아요를 표시할 수 있습니다" };
  }
  return { ok: true };
}

interface LikeEntry {
  userId: string;
  user: { id: string; name: string };
}

export function buildLikesInclude(role: string | null | undefined): object {
  if (role === "TEACHER") {
    return { select: { userId: true, user: { select: { id: true, name: true } } } };
  }
  return { _count: true };
}

export function formatLikesForStudent(
  likes: LikeEntry[],
  currentUserId: string
): { likeCount: number; myLike: boolean } {
  return {
    likeCount: likes.length,
    myLike: likes.some((l) => l.userId === currentUserId),
  };
}

export function formatLikesForTeacher(
  likes: LikeEntry[]
): { likeCount: number; likedBy: Array<{ id: string; name: string }> } {
  return {
    likeCount: likes.length,
    likedBy: likes.map((l) => ({ id: l.user.id, name: l.user.name })),
  };
}

export function sortQuestionsByLikes<T extends { likeCount: number }>(
  questions: T[],
  order: LikeSortOrder
): T[] {
  if (order === "none") return [...questions];
  return [...questions].sort((a, b) =>
    order === "desc" ? b.likeCount - a.likeCount : a.likeCount - b.likeCount
  );
}
