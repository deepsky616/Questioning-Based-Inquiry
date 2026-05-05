import { describe, it, expect } from "vitest";
import { buildLikesInclude, formatLikesForStudent, formatLikesForTeacher } from "@/lib/question-likes";

describe("buildLikesInclude", () => {
  it("학생용 include는 _count만 포함한다", () => {
    const include = buildLikesInclude("STUDENT");
    expect(include).toHaveProperty("_count");
    expect(include).not.toHaveProperty("select");
  });

  it("교사용 include는 사용자 정보도 포함한다", () => {
    const include = buildLikesInclude("TEACHER");
    expect(include).toHaveProperty("select");
  });
});

describe("formatLikesForStudent", () => {
  it("좋아요 수와 내 좋아요 여부를 반환한다", () => {
    const likes = [
      { userId: "u1", user: { id: "u1", name: "김철수" } },
      { userId: "u2", user: { id: "u2", name: "이영희" } },
    ];
    const result = formatLikesForStudent(likes, "u1");
    expect(result.likeCount).toBe(2);
    expect(result.myLike).toBe(true);
  });

  it("내가 좋아요 안 했으면 myLike가 false이다", () => {
    const likes = [{ userId: "u2", user: { id: "u2", name: "이영희" } }];
    const result = formatLikesForStudent(likes, "u1");
    expect(result.likeCount).toBe(1);
    expect(result.myLike).toBe(false);
  });

  it("좋아요 없으면 0과 false를 반환한다", () => {
    const result = formatLikesForStudent([], "u1");
    expect(result.likeCount).toBe(0);
    expect(result.myLike).toBe(false);
  });
});

describe("formatLikesForTeacher", () => {
  it("좋아요 수와 누가 좋아요 눌렀는지 이름 목록을 반환한다", () => {
    const likes = [
      { userId: "u1", user: { id: "u1", name: "김철수" } },
      { userId: "u2", user: { id: "u2", name: "이영희" } },
    ];
    const result = formatLikesForTeacher(likes);
    expect(result.likeCount).toBe(2);
    expect(result.likedBy).toHaveLength(2);
    expect(result.likedBy[0].name).toBe("김철수");
  });

  it("좋아요 없으면 빈 배열을 반환한다", () => {
    const result = formatLikesForTeacher([]);
    expect(result.likeCount).toBe(0);
    expect(result.likedBy).toEqual([]);
  });
});
