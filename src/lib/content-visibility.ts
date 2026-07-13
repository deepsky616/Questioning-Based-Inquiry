// 질문·댓글 열람 권한 판정 (순수 함수). API 라우트(목록·단건·번역)에서 공통 사용해
// "다른 학급 교사", "댓글 비공개 세션 학생" 등의 권한 규칙을 한곳에서 일관되게 적용한다.

import {
  studentCanAccessSession,
  type SessionAccessRecord,
} from "@/lib/session-access-policy";

export interface AuthorInfo {
  role: string;
  school: string | null;
  grade: string | null;
  className: string | null;
}

export interface Viewer {
  id: string;
  role: string;
  school: string | null;
  grade?: string | null;
  className?: string | null;
  teacherClasses: { grade: string; className: string }[];
}

type QuestionAccessInfo = {
  isPublic: boolean;
  authorId: string;
  author: AuthorInfo | null;
  session?: SessionAccessRecord | null;
};

/** 교사가 해당 학생 작성자를 볼 수 있는가: 같은 학교 + (담당 학급 없으면 학교 전체 / 있으면 해당 학급) */
export function teacherCanSeeAuthor(viewer: Viewer | null | undefined, author: AuthorInfo | null | undefined): boolean {
  if (!viewer || viewer.role !== "TEACHER" || !author || author.role !== "STUDENT") return false;
  if (!viewer.school || viewer.school !== author.school) return false;
  if (viewer.teacherClasses.length === 0) return true;
  return viewer.teacherClasses.some((tc) => tc.grade === author.grade && tc.className === author.className);
}

/** 질문 열람 가능: 본인 / 담당 학급 교사 / 같은 학급 공개 질문 / 같은 학교 교사 공개 질문 */
export function canViewQuestion(
  viewer: Viewer | null | undefined,
  q: QuestionAccessInfo,
): boolean {
  if (!viewer) return false;
  if (viewer.role !== "TEACHER" && viewer.role !== "STUDENT") return false;
  if (
    viewer.role === "STUDENT" &&
    q.session &&
    !studentCanAccessSession(q.session, {
      id: viewer.id,
      role: viewer.role,
      school: viewer.school,
      grade: viewer.grade ?? null,
      className: viewer.className ?? null,
    })
  ) {
    return false;
  }
  if (q.authorId === viewer.id) return true;
  if (viewer.role === "TEACHER") return teacherCanSeeAuthor(viewer, q.author);
  if (viewer.role !== "STUDENT" || !q.isPublic || !q.author || !viewer.school) return false;

  if (q.author.role === "STUDENT") {
    return Boolean(
      viewer.grade &&
      viewer.className &&
      viewer.school === q.author.school &&
      viewer.grade === q.author.grade &&
      viewer.className === q.author.className,
    );
  }

  return q.author.role === "TEACHER" && viewer.school === q.author.school;
}

/** 교사가 질문과 그 댓글을 관리할 수 있는가. */
export function canModerateQuestion(
  viewer: Viewer | null | undefined,
  q: QuestionAccessInfo,
): boolean {
  if (!viewer || viewer.role !== "TEACHER") return false;
  if (q.authorId === viewer.id && q.author?.role === "TEACHER") return true;
  return teacherCanSeeAuthor(viewer, q.author);
}

/** 댓글 작성 가능: 본인 질문 / 담당 교사 / 같은 학급 공개 학생 질문 / 같은 학교 교사 배포 공개 질문. */
export function canCommentOnQuestion(
  viewer: Viewer | null | undefined,
  q: QuestionAccessInfo,
): boolean {
  if (!viewer) return false;
  if (viewer.role === "TEACHER") return canModerateQuestion(viewer, q);
  if (viewer.role !== "STUDENT") return false;
  return canViewQuestion(viewer, q);
}

/**
 * 댓글 1건이 뷰어에게 보이는가 (부모 질문은 이미 볼 수 있다고 가정).
 * 교사 / 본인 댓글 / 교사가 쓴 댓글 / 내 질문의 댓글 / 세션이 댓글 공개면 노출.
 */
export function isCommentVisibleToViewer(args: {
  viewerRole: string;
  viewerId: string;
  commentsVisibleToPeers: boolean;
  commentAuthorId: string;
  commentAuthorRole: string;
  questionAuthorId: string;
}): boolean {
  const { viewerRole, viewerId, commentsVisibleToPeers, commentAuthorId, commentAuthorRole, questionAuthorId } = args;
  if (viewerRole === "TEACHER") return true;
  if (commentAuthorId === viewerId) return true;
  if (commentAuthorRole === "TEACHER") return true;
  if (questionAuthorId === viewerId) return true;
  return commentsVisibleToPeers;
}
