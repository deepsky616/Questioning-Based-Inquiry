import { describe, it, expect } from "vitest";
import { buildQuestionCreateData, buildQuestionWhereClause, resolveIsPublicFilter, canPatchQuestion, canCreateComment, validateBulkFeedback, validateBulkAiRequest, formatBulkAiSummary, countQuestionsWithComments } from "@/lib/questions";

describe("buildQuestionCreateData", () => {
  const baseData = {
    content: "광합성의 원리를 설명해 주세요",
    isPublic: false,
  };

  it("closure와 cognitive의 기본값은 open, factual이다", () => {
    const result = buildQuestionCreateData(baseData, "user1");
    expect(result.closure).toBe("open");
    expect(result.cognitive).toBe("factual");
  });

  it("closureScore가 0이어도 0으로 저장된다 (falsy 값 손실 없음)", () => {
    const result = buildQuestionCreateData({ ...baseData, closureScore: 0 }, "user1");
    expect(result.closureScore).toBe(0);
  });

  it("cognitiveScore가 0이어도 0으로 저장된다", () => {
    const result = buildQuestionCreateData({ ...baseData, cognitiveScore: 0 }, "user1");
    expect(result.cognitiveScore).toBe(0);
  });

  it("closureScore가 undefined이면 기본값 0.5를 사용한다", () => {
    const result = buildQuestionCreateData(baseData, "user1");
    expect(result.closureScore).toBe(0.5);
  });

  it("cognitiveScore가 undefined이면 기본값 0.5를 사용한다", () => {
    const result = buildQuestionCreateData(baseData, "user1");
    expect(result.cognitiveScore).toBe(0.5);
  });

  it("isPublic이 undefined이면 false로 저장된다", () => {
    const result = buildQuestionCreateData({ content: baseData.content }, "user1");
    expect(result.isPublic).toBe(false);
  });

  it("authorId를 올바르게 설정한다", () => {
    const result = buildQuestionCreateData(baseData, "user-abc");
    expect(result.authorId).toBe("user-abc");
  });
});

describe("buildQuestionWhereClause", () => {
  it("authorId 필터를 추가한다", () => {
    const where = buildQuestionWhereClause({ authorId: "user1" });
    expect(where.authorId).toBe("user1");
  });

  it("isPublic=true 필터를 추가한다", () => {
    const where = buildQuestionWhereClause({ isPublic: "true" });
    expect(where.isPublic).toBe(true);
  });

  it("isPublic=false이면 필터를 추가하지 않는다", () => {
    const where = buildQuestionWhereClause({ isPublic: "false" });
    expect(where.isPublic).toBeUndefined();
  });

  it("검색어 필터는 대소문자 구분 없이 동작한다", () => {
    const where = buildQuestionWhereClause({ search: "광합성" });
    expect(where.content).toEqual({ contains: "광합성", mode: "insensitive" });
  });

  it("검색어 없이 빈 객체를 반환한다", () => {
    const where = buildQuestionWhereClause({});
    expect(where).toEqual({});
  });

  it("sessionId 필터를 추가한다", () => {
    const where = buildQuestionWhereClause({ sessionId: "sess-123" });
    expect(where.sessionId).toBe("sess-123");
  });

  it("sessionId가 'none'이면 세션 없는 질문만 필터링한다", () => {
    const where = buildQuestionWhereClause({ sessionId: "none" });
    expect(where.sessionId).toBeNull();
  });

  it("sessionId가 'all'이면 세션 필터를 추가하지 않는다", () => {
    const where = buildQuestionWhereClause({ sessionId: "all" });
    expect(where.sessionId).toBeUndefined();
  });
});

describe("resolveIsPublicFilter", () => {
  it("교사는 isPublic 필터를 무시한다", () => {
    expect(resolveIsPublicFilter("TEACHER", "true")).toBeNull();
  });

  it("교사는 isPublic=false 필터도 무시한다", () => {
    expect(resolveIsPublicFilter("TEACHER", "false")).toBeNull();
  });

  it("학생은 isPublic=true 필터를 그대로 적용한다", () => {
    expect(resolveIsPublicFilter("STUDENT", "true")).toBe("true");
  });

  it("학생은 isPublic=false 필터를 그대로 적용한다", () => {
    expect(resolveIsPublicFilter("STUDENT", "false")).toBe("false");
  });

  it("필터 없이 호출하면 null을 반환한다", () => {
    expect(resolveIsPublicFilter("STUDENT", null)).toBeNull();
  });

  it("role이 없으면 필터를 그대로 유지한다", () => {
    expect(resolveIsPublicFilter(null, "true")).toBe("true");
  });
});

describe("canPatchQuestion", () => {
  it("교사는 어떤 필드든 수정할 수 있다", () => {
    expect(canPatchQuestion("TEACHER", "t1", "s1", ["closure"])).toBe(true);
    expect(canPatchQuestion("TEACHER", "t1", "s1", ["isPublic", "closure", "cognitive"])).toBe(true);
  });

  it("학생은 본인 질문의 isPublic만 수정할 수 있다", () => {
    expect(canPatchQuestion("STUDENT", "s1", "s1", ["isPublic"])).toBe(true);
  });

  it("학생은 본인 질문이라도 closure는 수정할 수 없다", () => {
    expect(canPatchQuestion("STUDENT", "s1", "s1", ["closure"])).toBe(false);
  });

  it("학생은 본인 질문이라도 cognitive는 수정할 수 없다", () => {
    expect(canPatchQuestion("STUDENT", "s1", "s1", ["cognitive"])).toBe(false);
  });

  it("학생은 다른 학생의 질문 isPublic을 수정할 수 없다", () => {
    expect(canPatchQuestion("STUDENT", "s1", "s2", ["isPublic"])).toBe(false);
  });

  it("role이 없으면 수정할 수 없다", () => {
    expect(canPatchQuestion(undefined, "u1", "u1", ["isPublic"])).toBe(false);
  });
});

describe("canCreateComment", () => {
  it("교사는 공개 질문에 코멘트를 작성할 수 있다", () => {
    expect(canCreateComment("TEACHER", true)).toBe(true);
  });

  it("교사는 비공개 질문에도 코멘트를 작성할 수 있다", () => {
    expect(canCreateComment("TEACHER", false)).toBe(true);
  });

  it("학생은 공개 질문에 코멘트를 작성할 수 있다", () => {
    expect(canCreateComment("STUDENT", true)).toBe(true);
  });

  it("학생은 비공개 질문에 코멘트를 작성할 수 없다", () => {
    expect(canCreateComment("STUDENT", false)).toBe(false);
  });

  it("role이 없으면 코멘트를 작성할 수 없다", () => {
    expect(canCreateComment(undefined, true)).toBe(false);
    expect(canCreateComment(null, true)).toBe(false);
  });
});

describe("validateBulkFeedback", () => {
  it("질문이 1개 이상이고 내용이 있으면 null을 반환한다", () => {
    expect(validateBulkFeedback(["id1", "id2"], "좋은 질문입니다")).toBeNull();
  });

  it("질문 목록이 비어있으면 에러 메시지를 반환한다", () => {
    expect(validateBulkFeedback([], "내용")).not.toBeNull();
  });

  it("내용이 빈 문자열이면 에러 메시지를 반환한다", () => {
    expect(validateBulkFeedback(["id1"], "")).not.toBeNull();
  });

  it("내용이 공백만 있으면 에러 메시지를 반환한다", () => {
    expect(validateBulkFeedback(["id1"], "   ")).not.toBeNull();
  });
});

describe("validateBulkAiRequest", () => {
  it("질문이 1개 이상이면 null을 반환한다", () => {
    expect(validateBulkAiRequest(["id1", "id2"])).toBeNull();
  });

  it("질문 목록이 비어있으면 에러 메시지를 반환한다", () => {
    expect(validateBulkAiRequest([])).not.toBeNull();
  });

  it("질문이 정확히 1개여도 유효하다", () => {
    expect(validateBulkAiRequest(["id1"])).toBeNull();
  });
});

describe("formatBulkAiSummary", () => {
  it("모두 성공하면 성공 메시지를 반환한다", () => {
    const msg = formatBulkAiSummary(3, 3);
    expect(msg).toContain("3");
  });

  it("일부 실패하면 성공/실패 수를 모두 포함한다", () => {
    const msg = formatBulkAiSummary(2, 3);
    expect(msg).toContain("2");
    expect(msg).toContain("1");
  });

  it("모두 실패하면 결과에 0이 포함된다", () => {
    const msg = formatBulkAiSummary(0, 3);
    expect(msg).toContain("0");
  });
});

describe("countQuestionsWithComments", () => {
  it("댓글이 있는 질문 수를 반환한다", () => {
    const questions = [
      { comments: [{ id: "c1" }] },
      { comments: [] },
      { comments: [{ id: "c2" }, { id: "c3" }] },
    ];
    expect(countQuestionsWithComments(questions)).toBe(2);
  });

  it("모든 질문에 댓글이 없으면 0을 반환한다", () => {
    const questions = [{ comments: [] }, { comments: [] }];
    expect(countQuestionsWithComments(questions)).toBe(0);
  });

  it("comments 필드가 undefined이면 댓글 없는 것으로 처리한다", () => {
    const questions = [{ comments: undefined }, { comments: [{ id: "c1" }] }];
    expect(countQuestionsWithComments(questions)).toBe(1);
  });

  it("질문 목록이 비어있으면 0을 반환한다", () => {
    expect(countQuestionsWithComments([])).toBe(0);
  });
});
