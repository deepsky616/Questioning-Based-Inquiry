import { describe, it, expect } from "vitest";
import {
  teacherCanSeeAuthor,
  canViewQuestion,
  canCommentOnQuestion,
  canModerateQuestion,
  isCommentVisibleToViewer,
  type Viewer,
  type AuthorInfo,
} from "@/lib/content-visibility";

const student: AuthorInfo = { role: "STUDENT", school: "한빛초", grade: "5", className: "1" };

const teacherOf = (classes: { grade: string; className: string }[], school = "한빛초"): Viewer => ({
  id: "t1", role: "TEACHER", school, teacherClasses: classes,
});
const studentViewer = (
  id: string,
  school = "한빛초",
  grade = "5",
  className = "1",
): Viewer => ({ id, role: "STUDENT", school, grade, className, teacherClasses: [] });

const individualSession = (targetStudentId: string) => ({
  teacherId: "t1",
  targetType: "STUDENT",
  targetGrade: null,
  targetClassName: null,
  targetStudentId,
  targetStudentIds: [targetStudentId],
  teacher: {
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  },
});

describe("teacherCanSeeAuthor", () => {
  it("담당 학급 교사는 해당 학생을 본다", () => {
    expect(teacherCanSeeAuthor(teacherOf([{ grade: "5", className: "1" }]), student)).toBe(true);
  });
  it("다른 학급 교사는 볼 수 없다", () => {
    expect(teacherCanSeeAuthor(teacherOf([{ grade: "6", className: "2" }]), student)).toBe(false);
  });
  it("다른 학교 교사는 볼 수 없다", () => {
    expect(teacherCanSeeAuthor(teacherOf([{ grade: "5", className: "1" }], "다른초"), student)).toBe(false);
  });
  it("담당 학급 미설정 교사는 같은 학교 전체를 본다", () => {
    expect(teacherCanSeeAuthor(teacherOf([]), student)).toBe(true);
  });
});

describe("canViewQuestion", () => {
  const q = (over: Partial<{ isPublic: boolean; authorId: string; session: ReturnType<typeof individualSession> | null }> = {}) => ({
    isPublic: false, authorId: "s1", author: student, ...over,
  });
  it("같은 학급 학생의 공개 질문은 볼 수 있다", () => {
    expect(canViewQuestion(studentViewer("other"), q({ isPublic: true }))).toBe(true);
  });
  it("다른 학교나 다른 학급 학생의 공개 질문은 볼 수 없다", () => {
    expect(canViewQuestion(studentViewer("other", "다른초"), q({ isPublic: true }))).toBe(false);
    expect(canViewQuestion(studentViewer("other", "한빛초", "6", "2"), q({ isPublic: true }))).toBe(false);
  });
  it("비공개 질문은 작성자 본인만(학생)", () => {
    expect(canViewQuestion(studentViewer("s1"), q())).toBe(true);
    expect(canViewQuestion(studentViewer("other"), q())).toBe(false);
  });
  it("알 수 없는 역할은 작성자 번호가 같아도 질문을 볼 수 없다", () => {
    expect(canViewQuestion(
      { ...studentViewer("s1"), role: "UNKNOWN" },
      q(),
    )).toBe(false);
  });
  it("비공개 질문은 담당 교사만, 다른 학급 교사는 불가", () => {
    expect(canViewQuestion(teacherOf([{ grade: "5", className: "1" }]), q())).toBe(true);
    expect(canViewQuestion(teacherOf([{ grade: "6", className: "2" }]), q())).toBe(false);
  });
  it("같은 학급 공개 질문이어도 질문수업 대상이 아니면 볼 수 없다", () => {
    expect(canViewQuestion(
      studentViewer("s2"),
      q({ isPublic: true, session: individualSession("s3") }),
    )).toBe(false);
  });
  it("자기 질문이어도 현재 질문수업 대상에서 제외되면 볼 수 없다", () => {
    expect(canViewQuestion(
      studentViewer("s1"),
      q({ session: individualSession("s3") }),
    )).toBe(false);
  });
});

describe("canCommentOnQuestion", () => {
  const studentQuestion = (over: Partial<{ isPublic: boolean; authorId: string; author: AuthorInfo }> = {}) => ({
    isPublic: true,
    authorId: "s1",
    author: student,
    ...over,
  });
  const teacherQuestion = (authorId = "t1", school = "한빛초") => ({
    isPublic: true,
    authorId,
    author: { role: "TEACHER", school, grade: null, className: null },
  });

  it("같은 학급 학생은 공개 질문에 댓글을 쓸 수 있다", () => {
    expect(canCommentOnQuestion({ ...studentViewer("s2"), grade: "5", className: "1" }, studentQuestion())).toBe(true);
  });

  it("다른 학급 학생은 공개 질문 id를 알아도 댓글을 쓸 수 없다", () => {
    expect(canCommentOnQuestion({ ...studentViewer("s2"), grade: "6", className: "2" }, studentQuestion())).toBe(false);
  });

  it("학생은 같은 학교 교사가 배포한 공개 질문에 댓글을 쓸 수 있다", () => {
    expect(canCommentOnQuestion({ ...studentViewer("s2"), grade: "5", className: "1" }, teacherQuestion())).toBe(true);
  });

  it("학생은 다른 학교 교사 질문에 댓글을 쓸 수 없다", () => {
    expect(canCommentOnQuestion({ ...studentViewer("s2"), grade: "5", className: "1" }, teacherQuestion("t1", "다른초"))).toBe(false);
  });

  it("담당 학급 교사만 학생 질문에 댓글을 쓸 수 있다", () => {
    expect(canCommentOnQuestion(teacherOf([{ grade: "5", className: "1" }]), studentQuestion())).toBe(true);
    expect(canCommentOnQuestion(teacherOf([{ grade: "6", className: "2" }]), studentQuestion())).toBe(false);
  });

  it("비공개 질문은 담당 교사와 작성자 본인만 댓글을 쓸 수 있다", () => {
    const privateQuestion = studentQuestion({ isPublic: false });
    expect(canCommentOnQuestion(teacherOf([{ grade: "5", className: "1" }]), privateQuestion)).toBe(true);
    expect(canCommentOnQuestion({ ...studentViewer("s1"), grade: "5", className: "1" }, privateQuestion)).toBe(true);
    expect(canCommentOnQuestion({ ...studentViewer("s2"), grade: "5", className: "1" }, privateQuestion)).toBe(false);
  });

  it("학생은 질문수업 대상이 아닌 공개 질문에 댓글을 쓸 수 없다", () => {
    expect(canCommentOnQuestion(
      studentViewer("s2"),
      { ...studentQuestion(), session: individualSession("s3") },
    )).toBe(false);
  });

  it("자기 질문이어도 현재 질문수업 대상에서 제외되면 댓글을 쓸 수 없다", () => {
    expect(canCommentOnQuestion(
      studentViewer("s1"),
      { ...studentQuestion(), session: individualSession("s3") },
    )).toBe(false);
  });
});

describe("canModerateQuestion", () => {
  const q = { isPublic: true, authorId: "s1", author: student };

  it("담당 학급 교사만 질문 댓글을 관리할 수 있다", () => {
    expect(canModerateQuestion(teacherOf([{ grade: "5", className: "1" }]), q)).toBe(true);
    expect(canModerateQuestion(teacherOf([{ grade: "6", className: "2" }]), q)).toBe(false);
  });

  it("교사는 본인이 만든 교사 질문을 관리할 수 있다", () => {
    expect(canModerateQuestion(teacherOf([]), { isPublic: true, authorId: "t1", author: { role: "TEACHER", school: "한빛초", grade: null, className: null } })).toBe(true);
  });
});

describe("isCommentVisibleToViewer", () => {
  const base = { viewerId: "s2", commentAuthorId: "s1", commentAuthorRole: "STUDENT", questionAuthorId: "qOwner" };
  it("교사는 항상 본다", () => {
    expect(isCommentVisibleToViewer({ ...base, viewerRole: "TEACHER", commentsVisibleToPeers: false })).toBe(true);
  });
  it("댓글 공개 세션이면 학생도 본다", () => {
    expect(isCommentVisibleToViewer({ ...base, viewerRole: "STUDENT", commentsVisibleToPeers: true })).toBe(true);
  });
  it("댓글 비공개 세션: 남의 댓글은 못 본다", () => {
    expect(isCommentVisibleToViewer({ ...base, viewerRole: "STUDENT", commentsVisibleToPeers: false })).toBe(false);
  });
  it("댓글 비공개여도 본인 댓글은 본다", () => {
    expect(isCommentVisibleToViewer({ ...base, viewerRole: "STUDENT", commentsVisibleToPeers: false, commentAuthorId: "s2" })).toBe(true);
  });
  it("댓글 비공개여도 교사가 쓴 댓글은 본다", () => {
    expect(isCommentVisibleToViewer({ ...base, viewerRole: "STUDENT", commentsVisibleToPeers: false, commentAuthorRole: "TEACHER" })).toBe(true);
  });
  it("댓글 비공개여도 내 질문에 달린 댓글은 본다", () => {
    expect(isCommentVisibleToViewer({ ...base, viewerRole: "STUDENT", commentsVisibleToPeers: false, questionAuthorId: "s2" })).toBe(true);
  });
});
