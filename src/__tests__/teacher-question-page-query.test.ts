import { describe, expect, it } from "vitest";
import { buildTeacherQuestionPagePath } from "@/lib/teacher-question-page-query";

describe("buildTeacherQuestionPagePath", () => {
  it("전체 수업의 페이지 필터와 정렬을 경량 조회 주소로 만든다", () => {
    const path = buildTeacherQuestionPagePath({
      selectedSessionId: "all",
      filterDate: "2026-07-13",
      filterSubject: "과학",
      filterTopic: "계절",
      filterClosure: "open",
      filterCognitive: "conceptual",
      showFlaggedOnly: true,
      search: "학생 질문",
      sortField: "comment",
      sortDir: "desc",
      page: 2,
      pageSize: 30,
    });
    const params = new URL(path, "http://localhost").searchParams;

    expect(params.get("view")).toBe("page");
    expect(params.get("page")).toBe("2");
    expect(params.get("date")).toBe("2026-07-13");
    expect(params.get("closure")).toBe("open");
    expect(params.get("cognitive")).toBe("conceptual");
    expect(params.get("flagged")).toBe("1");
    expect(params.get("search")).toBe("학생 질문");
    expect(params.get("commentSort")).toBe("desc");
  });

  it("특정 수업을 고르면 보조 날짜 필터 대신 수업 식별값만 보낸다", () => {
    const path = buildTeacherQuestionPagePath({
      selectedSessionId: "session-1",
      filterDate: "2026-07-13",
      filterSubject: "과학",
      filterTopic: "계절",
      filterClosure: "all",
      filterCognitive: "all",
      showFlaggedOnly: false,
      search: "",
      sortField: "student",
      sortDir: "asc",
      page: 1,
      pageSize: 30,
    });
    const params = new URL(path, "http://localhost").searchParams;

    expect(params.get("sessionId")).toBe("session-1");
    expect(params.has("date")).toBe(false);
    expect(params.has("subject")).toBe(false);
    expect(params.has("topic")).toBe(false);
    expect(params.get("studentSort")).toBe("asc");
  });
});
