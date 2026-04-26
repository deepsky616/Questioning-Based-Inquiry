import { describe, it, expect } from "vitest";
import { buildQuestionCreateData, buildQuestionWhereClause } from "@/lib/questions";

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
