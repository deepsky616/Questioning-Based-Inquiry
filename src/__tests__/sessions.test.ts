import { describe, it, expect } from "vitest";
import {
  buildSessionLabel,
  buildSessionContextHint,
  isSessionAvailable,
  sortSessionsAsc,
  sortSessionsDesc,
  isInquiryDesignSession,
} from "@/lib/sessions";

describe("isInquiryDesignSession", () => {
  it("unitDesignId가 있고 배포 질문이 없으면 탐구질문 수업이다", () => {
    expect(isInquiryDesignSession({ unitDesignId: "ud-1", sharedQuestions: [] })).toBe(true);
    expect(isInquiryDesignSession({ unitDesignId: "ud-1" })).toBe(true);
    expect(isInquiryDesignSession({ unitDesignId: "ud-1", sharedQuestions: null })).toBe(true);
  });

  it("배포 질문이 있으면(배포 세션) 탐구질문 수업이 아니다", () => {
    expect(isInquiryDesignSession({ unitDesignId: "ud-1", sharedQuestions: [{ type: "factual", content: "q" }] })).toBe(false);
  });

  it("unitDesignId가 없으면(일반 세션) 탐구질문 수업이 아니다", () => {
    expect(isInquiryDesignSession({ unitDesignId: null, sharedQuestions: [] })).toBe(false);
    expect(isInquiryDesignSession({})).toBe(false);
  });
});

describe("buildSessionLabel", () => {
  it("날짜·교과·주제를 합쳐 레이블을 반환한다", () => {
    expect(buildSessionLabel("2026-04-25", "과학", "지구의 역사")).toBe(
      "2026년 4월 25일 · 과학 · 지구의 역사"
    );
  });

  it("주제가 없으면 날짜·교과만 표시한다", () => {
    expect(buildSessionLabel("2026-04-25", "수학", "")).toBe("2026년 4월 25일 · 수학");
  });

  it("주제 앞뒤 공백은 무시한다", () => {
    expect(buildSessionLabel("2026-04-25", "국어", "  ")).toBe("2026년 4월 25일 · 국어");
  });
});

describe("isSessionAvailable", () => {
  it("오늘 날짜 세션은 사용 가능하다", () => {
    expect(isSessionAvailable("2026-04-25", new Date("2026-04-25T00:00:00"))).toBe(true);
  });

  it("미래 세션은 사용 가능하다", () => {
    expect(isSessionAvailable("2026-04-30", new Date("2026-04-25T00:00:00"))).toBe(true);
  });

  it("지난 세션은 사용 불가하다", () => {
    expect(isSessionAvailable("2026-04-24", new Date("2026-04-25T00:00:00"))).toBe(false);
  });
});

describe("buildSessionContextHint", () => {
  it("교사명·교과·주제 모두 있으면 전체 힌트를 반환한다", () => {
    expect(buildSessionContextHint("과학", "지구의 역사", "김철수")).toBe(
      "김철수 선생님의 과학 '지구의 역사' 수업 중"
    );
  });

  it("주제가 없으면 교사명·교과만 포함한다", () => {
    expect(buildSessionContextHint("수학", "", "이영희")).toBe(
      "이영희 선생님의 수학 수업 중"
    );
  });

  it("교사명이 없으면 교과·주제만 포함한다", () => {
    expect(buildSessionContextHint("국어", "시 읽기")).toBe(
      "국어 '시 읽기' 수업 중"
    );
  });

  it("주제 앞뒤 공백은 무시한다", () => {
    expect(buildSessionContextHint("과학", "  생태계  ", "박지성")).toBe(
      "박지성 선생님의 과학 '생태계' 수업 중"
    );
  });
});

describe("sortSessionsDesc", () => {
  it("날짜 내림차순으로 정렬한다", () => {
    const sessions = [
      { id: "a", date: "2026-04-20", subject: "과학", topic: "" },
      { id: "b", date: "2026-04-25", subject: "수학", topic: "" },
      { id: "c", date: "2026-04-22", subject: "국어", topic: "" },
    ];
    const sorted = sortSessionsDesc(sessions);
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("같은 날짜에서는 생성 시각이 최신인 세션을 먼저 둔다", () => {
    const sessions = [
      { id: "a", date: "2026-04-25", createdAt: "2026-04-25T09:00:00.000Z", subject: "과학", topic: "" },
      { id: "b", date: "2026-04-25", createdAt: "2026-04-25T10:00:00.000Z", subject: "수학", topic: "" },
      { id: "c", date: "2026-04-24", createdAt: "2026-04-24T11:00:00.000Z", subject: "국어", topic: "" },
    ];
    const sorted = sortSessionsDesc(sessions);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });
});

describe("sortSessionsAsc", () => {
  it("오래된순에서는 같은 날짜의 생성 시각도 오래된 순서로 둔다", () => {
    const sessions = [
      { id: "a", date: "2026-04-25", createdAt: "2026-04-25T10:00:00.000Z", subject: "과학", topic: "" },
      { id: "b", date: "2026-04-25", createdAt: "2026-04-25T09:00:00.000Z", subject: "수학", topic: "" },
      { id: "c", date: "2026-04-26", createdAt: "2026-04-26T11:00:00.000Z", subject: "국어", topic: "" },
    ];
    const sorted = sortSessionsAsc(sessions);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a", "c"]);
  });
});
