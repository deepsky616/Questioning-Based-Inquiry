// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NextIntlClientProvider } from "next-intl";
import { StudentAskSessionSelector } from "@/app/(student)/student-ask/StudentAskSessionSelector";
import ko from "../../messages/ko.json";
vi.mock("@/components/shared/use-session-meta-translation", () => ({ useSessionMetaTranslation: () => ({ label: (s: {topic: string}) => s.topic, subject: () => "과학", topic: (s: {topic: string}) => s.topic, gradeLabel: () => "5학년", subjectOption: (s: string) => s, topicOption: (s: string) => s }) }));
afterEach(cleanup);
it("선택한 수업을 요약하고 다시 선택할 때만 목록을 펼친다", () => {
  const select = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  render(<NextIntlClientProvider locale="ko" messages={ko}><StudentAskSessionSelector taskScope={null} filterOptions={{ dates: ["2026-09-08"], subjects: ["과학"], topics: ["용해"] }} filterDate="" filterSubject="" filterTopic="" filteredSessions={[{ id: "s1", date: "2026-09-08", subject: "과학", topic: "용해", teacher: { name: "김탐구" }, sharedQuestions: [] }]} selectedSessionId="s1" questionSessionIds={new Set()} questionStatusAvailable sessionProgress={{total:1,completed:0,remaining:1,percent:0}} search="" onSearch={vi.fn()} todayStr="2026-09-08" filtersActive={false} onShowAllSessions={vi.fn()} onFilterDateChange={vi.fn()} onFilterSubjectChange={vi.fn()} onFilterTopicChange={vi.fn()} onSelectSession={select} getSessionDateBadge={()=>"오늘"}/></NextIntlClientProvider>);
  const change = screen.getByRole("button", { name: "수업 변경" });
  expect(change).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(change);
  expect(change).toHaveAttribute("aria-expanded", "true");
  fireEvent.change(screen.getByLabelText(/질문수업 선택/), { target: { value: "s1" } });
  expect(change).toHaveAttribute("aria-expanded", "false");
  expect(select).toHaveBeenCalledWith("s1");
});
