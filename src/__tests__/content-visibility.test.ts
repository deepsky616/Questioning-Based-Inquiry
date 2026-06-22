import { describe, it, expect } from "vitest";
import { teacherCanSeeAuthor, canViewQuestion, isCommentVisibleToViewer, type Viewer, type AuthorInfo } from "@/lib/content-visibility";

const student: AuthorInfo = { role: "STUDENT", school: "한빛초", grade: "5", className: "1" };

const teacherOf = (classes: { grade: string; className: string }[], school = "한빛초"): Viewer => ({
  id: "t1", role: "TEACHER", school, teacherClasses: classes,
});
const studentViewer = (id: string): Viewer => ({ id, role: "STUDENT", school: "한빛초", teacherClasses: [] });

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
  const q = (over: Partial<{ isPublic: boolean; authorId: string }> = {}) => ({
    isPublic: false, authorId: "s1", author: student, ...over,
  });
  it("공개 질문은 누구나", () => {
    expect(canViewQuestion(studentViewer("other"), q({ isPublic: true }))).toBe(true);
  });
  it("비공개 질문은 작성자 본인만(학생)", () => {
    expect(canViewQuestion(studentViewer("s1"), q())).toBe(true);
    expect(canViewQuestion(studentViewer("other"), q())).toBe(false);
  });
  it("비공개 질문은 담당 교사만, 다른 학급 교사는 불가", () => {
    expect(canViewQuestion(teacherOf([{ grade: "5", className: "1" }]), q())).toBe(true);
    expect(canViewQuestion(teacherOf([{ grade: "6", className: "2" }]), q())).toBe(false);
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
