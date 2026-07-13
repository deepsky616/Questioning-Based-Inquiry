import { describe, expect, it } from "vitest";
import {
  buildTeacherQuestionPagePath,
  buildTeacherQuestionViewPath,
  parseTeacherQuestionViewState,
  resolveTeacherQuestionSessionSelection,
  runWhenTeacherQuestionScopeCurrent,
} from "@/lib/teacher-question-page-query";

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

describe("교사 질문 조회 주소 상태", () => {
  it("수업과 필터와 정렬과 쪽 번호를 주소에서 복원한다", () => {
    const state = parseTeacherQuestionViewState(new URLSearchParams({
      session: "session-1",
      date: "2026-07-13",
      subject: "과학",
      topic: "계절 변화",
      closure: "open",
      cognitive: "conceptual",
      flagged: "1",
      search: "학생 질문",
      sort: "comment",
      dir: "desc",
      page: "3",
      tab: "design",
    }));

    expect(state).toEqual({
      session: "session-1",
      date: "2026-07-13",
      subject: "과학",
      topic: "계절 변화",
      closure: "open",
      cognitive: "conceptual",
      flagged: true,
      search: "학생 질문",
      sort: "comment",
      dir: "desc",
      page: 3,
      tab: "design",
    });
  });

  it("잘못된 열거값과 쪽 번호는 안전한 기본값으로 바꾼다", () => {
    const state = parseTeacherQuestionViewState(new URLSearchParams({
      closure: "invalid",
      cognitive: "invalid",
      sort: "invalid",
      dir: "invalid",
      page: "2oops",
      tab: "invalid",
    }));

    expect(state).toMatchObject({
      session: "all",
      closure: "all",
      cognitive: "all",
      flagged: false,
      sort: "student",
      dir: "asc",
      page: 1,
      tab: "questions",
    });
  });

  it("사용자 주소에는 기본값과 내부 조회 매개변수를 넣지 않고 왕복한다", () => {
    const path = buildTeacherQuestionViewPath({
      session: "session-1",
      date: "",
      subject: "과학",
      topic: "",
      closure: "all",
      cognitive: "controversial",
      flagged: false,
      search: "왜 그럴까",
      sort: "like",
      dir: "desc",
      page: 2,
      tab: "questions",
    });
    const url = new URL(path, "http://localhost");

    expect(url.pathname).toBe("/teacher-questions");
    expect(url.searchParams.has("view")).toBe(false);
    expect(url.searchParams.has("pageSize")).toBe(false);
    expect(url.searchParams.has("sessionId")).toBe(false);
    expect(url.searchParams.has("closure")).toBe(false);
    expect(url.searchParams.has("tab")).toBe(false);
    expect(parseTeacherQuestionViewState(url.searchParams)).toEqual({
      session: "session-1",
      date: "",
      subject: "과학",
      topic: "",
      closure: "all",
      cognitive: "controversial",
      flagged: false,
      search: "왜 그럴까",
      sort: "like",
      dir: "desc",
      page: 2,
      tab: "questions",
    });
  });

  it("필터 결과가 비면 기존 수업 선택을 전체로 보정한다", () => {
    expect(resolveTeacherQuestionSessionSelection({
      selectedSessionId: "session-1",
      sessionIds: ["session-1"],
      filteredSessionIds: [],
    })).toBe("all");
  });

  it("선택 수업이 필터 결과에 없으면 첫 결과로 보정한다", () => {
    expect(resolveTeacherQuestionSessionSelection({
      selectedSessionId: "session-1",
      sessionIds: ["session-1", "session-2"],
      filteredSessionIds: ["session-2"],
    })).toBe("session-2");
    expect(resolveTeacherQuestionSessionSelection({
      selectedSessionId: "session-2",
      sessionIds: ["session-1", "session-2"],
      filteredSessionIds: ["session-2"],
    })).toBeNull();
  });

  it("요청 뒤 조회 범위가 바뀌면 지연된 화면 정리를 실행하지 않는다", () => {
    vi.useFakeTimers();
    let currentScope = "session-1";
    const clearSelection = vi.fn();

    setTimeout(() => {
      runWhenTeacherQuestionScopeCurrent(
        "session-1",
        () => currentScope,
        clearSelection,
      );
    }, 2000);
    currentScope = "session-2";
    vi.advanceTimersByTime(2000);

    expect(clearSelection).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("같은 조회 범위에서도 새 선택이 생기면 이전 지연 정리가 새 선택을 지우지 않는다", () => {
    vi.useFakeTimers();
    const requestScope = "session-1";
    const requestSelectionRevision = 0;
    const currentScope = requestScope;
    let currentSelectionRevision = requestSelectionRevision;
    let selectedIds = ["old-question"];

    setTimeout(() => {
      runWhenTeacherQuestionScopeCurrent(requestScope, () => currentScope, () => {
        if (currentSelectionRevision === requestSelectionRevision) selectedIds = [];
      });
    }, 2000);
    selectedIds = ["new-question"];
    currentSelectionRevision += 1;
    vi.advanceTimersByTime(2000);

    expect(currentScope).toBe(requestScope);
    expect(selectedIds).toEqual(["new-question"]);
    vi.useRealTimers();
  });

  it("같은 조회 범위라도 요청 뒤 선택 버전이 바뀌면 결과를 반영하지 않는다", () => {
    const applyPreview = vi.fn();

    const applied = runWhenTeacherQuestionScopeCurrent(
      "session-1",
      () => "session-1",
      applyPreview,
      {
        requestRevision: 3,
        getCurrentRevision: () => 4,
      },
    );

    expect(applied).toBe(false);
    expect(applyPreview).not.toHaveBeenCalled();
  });
});
