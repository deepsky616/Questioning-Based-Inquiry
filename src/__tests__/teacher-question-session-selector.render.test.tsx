// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeacherQuestionSessionSelector } from "@/app/(teacher)/teacher-questions/TeacherQuestionSessionSelector";

vi.mock("@/components/shared/use-session-meta-translation", () => ({
  useSessionMetaTranslation: () => ({
    label: () => "질문수업",
    subjectOption: (value: string) => value,
    topicOption: (value: string) => value,
  }),
}));

const labels = {
  loadingSessions: "질문수업을 불러오는 중입니다.",
  sessionLoadError: "질문수업 목록을 불러오지 못했습니다.",
  sessionRetry: "질문수업 목록 다시 불러오기",
  noSessions: "등록된 질문수업이 없습니다.",
  date: "날짜",
  allDates: "전체 날짜",
  subject: "교과",
  all: "전체",
  allSubjects: "전체 교과",
  topicFilterLabel: "주제",
  allTopics: "전체 주제",
  classSession: "질문수업",
  noMatchingSession: "조건에 맞는 질문수업이 없습니다.",
  selectSession: "질문수업 선택",
  allSessions: "전체 질문수업",
  filterHint: "조건으로 좁혀 보세요.",
};

const baseProps = {
  sessions: [],
  filterOptions: { dates: [], subjects: [], topics: [] },
  filteredSessions: [],
  selectedSessionId: "all",
  filterDate: "",
  filterSubject: "",
  filterTopic: "",
  onFilterDateChange: vi.fn(),
  onFilterSubjectChange: vi.fn(),
  onFilterTopicChange: vi.fn(),
  onSessionChange: vi.fn(),
  labels,
};

describe("교사 질문수업 선택기", () => {
  afterEach(cleanup);

  it("조회 중에는 등록된 수업 없음 문구를 표시하지 않는다", () => {
    render(<TeacherQuestionSessionSelector {...baseProps} status="loading" />);

    expect(screen.getByRole("status")).toHaveTextContent("질문수업을 불러오는 중입니다.");
    expect(screen.queryByText("등록된 질문수업이 없습니다.")).not.toBeInTheDocument();
  });

  it("조회 실패를 빈 목록과 구분하고 다시 불러온다", () => {
    const onRetry = vi.fn();
    render(
      <TeacherQuestionSessionSelector
        {...baseProps}
        status="error"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("질문수업 목록을 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "질문수업 목록 다시 불러오기" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("교과와 주제 선택기에 목적을 설명하는 이름을 제공한다", () => {
    const session = {
      id: "session-1",
      date: "2026-07-13",
      subject: "과학",
      topic: "물질의 변화",
      teacher: { name: "교사" },
    };
    render(
      <TeacherQuestionSessionSelector
        {...baseProps}
        sessions={[session]}
        filteredSessions={[session]}
        filterOptions={{
          dates: [session.date],
          subjects: [session.subject],
          topics: [session.topic],
        }}
      />,
    );

    expect(screen.getByRole("combobox", { name: "교과" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "주제" })).toBeInTheDocument();
  });
});
