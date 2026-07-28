import { describe, it, expect } from "vitest";
import {
  buildSessionLabel,
  buildSessionContextHint,
  isSessionAvailable,
  sortSessionsAsc,
  sortSessionsDesc,
  isInquiryDesignSession,
  isValidSessionDateString,
  normalizeSessionDate,
  getSessionFilterOptions,
  groupSessionDatesByMonth,
  groupSessionsByMonth,
} from "@/lib/sessions";

describe("session date validation", () => {
  it("정확한 날짜 형식만 유효하게 본다", () => {
    expect(isValidSessionDateString("2026-02-28")).toBe(true);
    expect(isValidSessionDateString("2026-2-28")).toBe(false);
    expect(isValidSessionDateString("2026-02-30")).toBe(false);
    expect(isValidSessionDateString("2026-13-01")).toBe(false);
    expect(isValidSessionDateString("")).toBe(false);
  });

  it("날짜를 정규화할 때 공백은 제거하고 잘못된 값은 null로 반환한다", () => {
    expect(normalizeSessionDate(" 2026-04-25 ")).toBe("2026-04-25");
    expect(normalizeSessionDate("2026-04-31")).toBeNull();
    expect(normalizeSessionDate("   ")).toBeNull();
    expect(normalizeSessionDate(null)).toBeNull();
  });
});

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
      "2026-04-25 · 과학 · 지구의 역사"
    );
  });

  it("학년을 날짜와 교과 사이에 표시한다", () => {
    expect(
      buildSessionLabel(
        "2026-07-28",
        "수학",
        "6. 평면도형의 둘레와 넓이",
        "5",
      ),
    ).toBe("2026-07-28 · 5학년 · 수학 · 6. 평면도형의 둘레와 넓이");
  });

  it("학년 단위가 포함된 값도 학년을 한 번만 표시한다", () => {
    expect(
      buildSessionLabel("2026-07-28", "수학", "도형의 넓이", "5학년"),
    ).toBe("2026-07-28 · 5학년 · 수학 · 도형의 넓이");
  });

  it("저장된 주제에 날짜·학년·교과가 포함되어도 제목을 중복하지 않는다", () => {
    expect(
      buildSessionLabel(
        "2026-07-28",
        "수학",
        "2026-07-28 5학년 수학 6. 평면도형의 둘레와 넓이",
        "5",
      ),
    ).toBe("2026-07-28 · 5학년 · 수학 · 6. 평면도형의 둘레와 넓이");
  });

  it("주제가 없으면 날짜·교과만 표시한다", () => {
    expect(buildSessionLabel("2026-04-25", "수학", "")).toBe("2026-04-25 · 수학");
  });

  it("주제 앞뒤 공백은 무시한다", () => {
    expect(buildSessionLabel("2026-04-25", "국어", "  ")).toBe("2026-04-25 · 국어");
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

  it("잘못된 날짜 세션은 사용 불가로 본다", () => {
    expect(isSessionAvailable("2026-04-31", new Date("2026-04-25T00:00:00"))).toBe(false);
  });
});

describe("getSessionFilterOptions", () => {
  it("필터 날짜 옵션에는 유효한 수업 날짜만 최신순으로 포함한다", () => {
    const options = getSessionFilterOptions([
      { date: "2026-04-25", subject: "과학", topic: "" },
      { date: "2026-04-31", subject: "수학", topic: "" },
      { date: "2026-05-01", subject: "국어", topic: "" },
    ]);
    expect(options.dates).toEqual(["2026-05-01", "2026-04-25"]);
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

describe("groupSessionsByMonth", () => {
  it("수업세션을 최신 월부터 묶고 같은 월 안에서도 최신 세션을 먼저 둔다", () => {
    const sessions = [
      { id: "a", date: "2026-07-02", createdAt: "2026-07-02T09:00:00.000Z", subject: "과학", topic: "" },
      { id: "b", date: "2026-06-30", createdAt: "2026-06-30T09:00:00.000Z", subject: "수학", topic: "" },
      { id: "c", date: "2026-07-02", createdAt: "2026-07-02T10:00:00.000Z", subject: "국어", topic: "" },
      { id: "d", date: "2026-05-15", createdAt: "2026-05-15T09:00:00.000Z", subject: "사회", topic: "" },
    ];

    const groups = groupSessionsByMonth(sessions);

    expect(groups.map((group) => group.key)).toEqual(["2026-07", "2026-06", "2026-05"]);
    expect(groups.map((group) => group.label)).toEqual(["2026-07", "2026-06", "2026-05"]);
    expect(groups[0].sessions.map((session) => session.id)).toEqual(["c", "a"]);
    expect(groups[1].sessions.map((session) => session.id)).toEqual(["b"]);
  });

  it("날짜가 잘못된 수업세션도 날짜 미정 그룹에 보존한다", () => {
    const groups = groupSessionsByMonth([
      { id: "a", date: "2026-07-02", subject: "과학", topic: "" },
      { id: "b", date: "2026-07-40", subject: "수학", topic: "" },
    ]);

    expect(groups.map((group) => group.key)).toEqual(["2026-07", "unknown"]);
    expect(groups[1].label).toBe("날짜 미정");
    expect(groups[1].sessions.map((session) => session.id)).toEqual(["b"]);
  });

  it("오래된순 그룹이 필요하면 월과 세션을 오래된순으로 묶는다", () => {
    const groups = groupSessionsByMonth([
      { id: "a", date: "2026-07-02", createdAt: "2026-07-02T10:00:00.000Z", subject: "과학", topic: "" },
      { id: "b", date: "2026-06-30", createdAt: "2026-06-30T09:00:00.000Z", subject: "수학", topic: "" },
      { id: "c", date: "2026-07-02", createdAt: "2026-07-02T09:00:00.000Z", subject: "국어", topic: "" },
    ], "asc");

    expect(groups.map((group) => group.key)).toEqual(["2026-06", "2026-07"]);
    expect(groups[1].sessions.map((session) => session.id)).toEqual(["c", "a"]);
  });
});

describe("groupSessionDatesByMonth", () => {
  it("날짜 조회 옵션을 최신 월부터 묶고 같은 월 안에서도 최신 날짜를 먼저 둔다", () => {
    const groups = groupSessionDatesByMonth(["2026-06-01", "2026-07-02", "2026-07-01", "bad"]);

    expect(groups.map((group) => group.key)).toEqual(["2026-07", "2026-06"]);
    expect(groups[0].label).toBe("2026-07");
    expect(groups[0].dates).toEqual(["2026-07-02", "2026-07-01"]);
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
