import { describe, expect, it } from "vitest";
import { summarizeClassSessionActivity, summarizeStudentSessionActivity } from "@/lib/report-session-activity";

describe("summarizeClassSessionActivity", () => {
  it("세션별 현재 질문, 좋아요, 댓글 수를 한 번에 집계한다", () => {
    const summary = summarizeClassSessionActivity({
      questions: [
        { id: "q1", sessionId: "s1", likeCount: 2 },
        { id: "q2", sessionId: "s1", likeCount: 1 },
        { id: "q3", sessionId: "s2", likeCount: 4 },
      ],
      comments: [
        { questionId: "q1" },
        { questionId: "q1" },
        { questionId: "q3" },
      ],
    });

    expect(summary.get("s1")).toEqual({ currentQuestions: 2, currentLikes: 3, currentComments: 2 });
    expect(summary.get("s2")).toEqual({ currentQuestions: 1, currentLikes: 4, currentComments: 1 });
  });
});

describe("summarizeStudentSessionActivity", () => {
  it("학생 활동을 세션별 현재 질문, 좋아요, 댓글 수로 집계한다", () => {
    const summary = summarizeStudentSessionActivity({
      questions: [{ sessionId: "s1" }, { sessionId: "s1" }],
      comments: [{ sessionId: "s1" }, { sessionId: "s2" }],
      likes: [{ sessionId: "s2" }, { sessionId: "s2" }],
    });

    expect(summary.get("s1")).toEqual({ currentQuestions: 2, currentLikes: 0, currentComments: 1 });
    expect(summary.get("s2")).toEqual({ currentQuestions: 0, currentLikes: 2, currentComments: 1 });
  });
});
