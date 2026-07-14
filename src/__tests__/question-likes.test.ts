import { describe, it, expect } from "vitest";
import {
  canLikeQuestion,
  sortQuestionsByLikes,
  type LikeSortOrder,
} from "@/lib/question-likes";

describe("canLikeQuestion", () => {
  it("다른 학생 질문에는 좋아요를 할 수 있다", () => {
    const result = canLikeQuestion({
      likerId: "student-1",
      questionAuthorId: "student-2",
      likerRole: "STUDENT",
    });
    expect(result.ok).toBe(true);
  });

  it("자신의 질문에는 좋아요를 할 수 없다", () => {
    const result = canLikeQuestion({
      likerId: "student-1",
      questionAuthorId: "student-1",
      likerRole: "STUDENT",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/자신/);
  });

  it("교사는 학생 질문에 좋아요를 할 수 있다", () => {
    const result = canLikeQuestion({
      likerId: "teacher-1",
      questionAuthorId: "student-1",
      likerRole: "TEACHER",
      questionAuthorRole: "STUDENT",
    });
    expect(result.ok).toBe(true);
  });

  it("교사는 교사 질문에는 좋아요를 할 수 없다", () => {
    const result = canLikeQuestion({
      likerId: "teacher-1",
      questionAuthorId: "teacher-2",
      likerRole: "TEACHER",
      questionAuthorRole: "TEACHER",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/학생 질문/);
  });

  it("학생은 비공개 질문에는 좋아요를 할 수 없다", () => {
    const result = canLikeQuestion({
      likerId: "student-1",
      questionAuthorId: "student-2",
      likerRole: "STUDENT",
      isPublic: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/공개/);
  });

  it("교사는 담당 범위에서 열람 가능한 비공개 학생 질문에도 좋아요를 할 수 있다", () => {
    const result = canLikeQuestion({
      likerId: "teacher-1",
      questionAuthorId: "student-1",
      likerRole: "TEACHER",
      questionAuthorRole: "STUDENT",
      isPublic: false,
    });
    expect(result.ok).toBe(true);
  });

  it("공개 질문에는 좋아요를 할 수 있다", () => {
    const result = canLikeQuestion({
      likerId: "student-1",
      questionAuthorId: "student-2",
      likerRole: "STUDENT",
      isPublic: true,
    });
    expect(result.ok).toBe(true);
  });

  it("isPublic 미지정시 기본적으로 허용한다 (API에서 isPublic 검증)", () => {
    const result = canLikeQuestion({
      likerId: "student-1",
      questionAuthorId: "student-2",
      likerRole: "STUDENT",
    });
    expect(result.ok).toBe(true);
  });
});

describe("sortQuestionsByLikes", () => {
  const questions = [
    { id: "q1", likeCount: 3 },
    { id: "q2", likeCount: 1 },
    { id: "q3", likeCount: 5 },
    { id: "q4", likeCount: 1 },
  ];

  it("내림차순으로 정렬하면 좋아요 많은 순서이다", () => {
    const result = sortQuestionsByLikes(questions, "desc");
    expect(result[0].likeCount).toBe(5);
    expect(result[1].likeCount).toBe(3);
    expect(result[result.length - 1].likeCount).toBe(1);
  });

  it("오름차순으로 정렬하면 좋아요 적은 순서이다", () => {
    const result = sortQuestionsByLikes(questions, "asc");
    expect(result[0].likeCount).toBe(1);
    expect(result[result.length - 1].likeCount).toBe(5);
  });

  it("정렬 없음(none)은 원래 순서를 유지한다", () => {
    const result = sortQuestionsByLikes(questions, "none");
    expect(result[0].id).toBe("q1");
    expect(result[1].id).toBe("q2");
  });

  it("빈 배열이면 빈 배열을 반환한다", () => {
    expect(sortQuestionsByLikes([], "desc")).toEqual([]);
  });

  it("동일한 좋아요 수는 순서를 보존한다", () => {
    const result = sortQuestionsByLikes(questions, "asc");
    const ones = result.filter((q) => q.likeCount === 1);
    expect(ones[0].id).toBe("q2");
    expect(ones[1].id).toBe("q4");
  });
});
