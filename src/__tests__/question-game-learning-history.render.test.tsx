// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { QuestionGameLearningHistory } from "@/components/question-games/QuestionGameLearningHistory";

class NoopResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: NoopResizeObserver,
});

afterEach(cleanup);

describe("질문놀이 학습 이력 화면", () => {
  it("학생에게 방식별 요약과 최근 놀이 결과를 보여 준다", () => {
    render(
      <QuestionGameLearningHistory
        audience="student"
        history={{
          totals: { plays: 3, points: 28, goodQuestions: 6 },
          modes: {
            solo: { plays: 1, points: 4, goodQuestions: 1 },
            ai: { plays: 1, points: 7, goodQuestions: 2 },
            friend: { plays: 1, points: 17, goodQuestions: 3 },
          },
          weekly: [
            { weekStart: "2026-07-06", plays: 1, goodQuestions: 2 },
            { weekStart: "2026-07-13", plays: 2, goodQuestions: 4 },
          ],
          gameModes: [{
            gameId: "relay",
            modes: {
              solo: { plays: 0, completions: 0, participants: 0 },
              ai: { plays: 1, completions: 1, participants: 1 },
              friend: { plays: 2, completions: 2, participants: 1 },
            },
          }],
          recent: [{
            id: "friend:room:1",
            gameId: "relay",
            mode: "friend",
            completedAt: "2026-07-17T01:00:00.000Z",
            points: 17,
            goodQuestions: 3,
          }],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "나의 질문놀이 학습 기록" })).toBeVisible();
    expect(screen.getByText("완료한 놀이").nextSibling).toHaveTextContent("3");
    expect(screen.getByText("혼자 하기 1회")).toBeVisible();
    expect(screen.getByText("인공지능과 함께 1회")).toBeVisible();
    expect(screen.getByText("친구와 함께 1회")).toBeVisible();
    expect(screen.getByText("최근 6주 변화")).toBeVisible();
    expect(screen.getByText("놀이별 참여 방식")).toBeVisible();
    expect(screen.getByText(
      "질문 릴레이: 혼자 하기 완료 0회, 인공지능과 함께 완료 1회, 친구와 함께 완료 2회",
    ).closest("ul")).toHaveClass("sr-only");
    expect(screen.getByText("7. 13. 시작 주: 완료 2회, 좋은 질문 4개").closest("ul"))
      .toHaveClass("sr-only");
    expect(screen.getByText("질문 릴레이")).toBeVisible();
    expect(screen.getByText("좋은 질문 3개 · 17점")).toBeVisible();
  });

  it("상세 이력을 방식과 놀이로 걸러 보고 다음 기록을 이어 본다", async () => {
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{
          id: "run:ai-1",
          gameId: "kaba",
          mode: "ai",
          completedAt: "2026-07-16T01:00:00.000Z",
          points: 7,
          goodQuestions: 2,
        }],
        nextCursor: "page-2",
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [{
          id: "run:ai-0",
          gameId: "kaba",
          mode: "ai",
          completedAt: "2026-07-15T01:00:00.000Z",
          points: 5,
          goodQuestions: 1,
        }],
        nextCursor: null,
      })));

    render(
      <QuestionGameLearningHistory
        audience="teacher"
        studentId="student-1"
        history={{
          totals: { plays: 2, points: 12, goodQuestions: 3 },
          modes: {
            solo: { plays: 0, points: 0, goodQuestions: 0 },
            ai: { plays: 2, points: 12, goodQuestions: 3 },
            friend: { plays: 0, points: 0, goodQuestions: 0 },
          },
          recent: [],
          nextCursor: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "전체 이력 보기" }));
    expect(screen.queryByText("최근 완료한 놀이")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("놀이 방식"), { target: { value: "ai" } });
    fireEvent.change(screen.getByLabelText("질문놀이"), { target: { value: "kaba" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(
      "mode=ai&gameId=kaba&studentId=student-1",
    )));
    await waitFor(() => expect(
      screen.getAllByText("까바놀이").filter((element) => element.tagName !== "OPTION"),
    ).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining(
      "cursor=page-2",
    )));
    expect(
      screen.getAllByText("까바놀이").filter((element) => element.tagName !== "OPTION"),
    ).toHaveLength(2);

    fetchMock.mockRestore();
  });

  it("교사 학급 보기에서는 반 전체 요약만 간결하게 보여 준다", () => {
    render(
      <QuestionGameLearningHistory
        audience="class"
        history={{
          totals: { plays: 8, points: 54, goodQuestions: 21 },
          modes: {
            solo: { plays: 2, points: 10, goodQuestions: 4 },
            ai: { plays: 2, points: 14, goodQuestions: 5 },
            friend: { plays: 4, points: 30, goodQuestions: 12 },
          },
          weekly: [{ weekStart: "2026-07-13", plays: 8, goodQuestions: 21 }],
          gameModes: [{
            gameId: "relay",
            modes: {
              solo: { plays: 2, completions: 2, participants: 1 },
              ai: { plays: 0, completions: 0, participants: 0 },
              friend: { plays: 3, completions: 3, participants: 2 },
            },
          }],
          recent: [],
        }}
        classStudentCount={4}
        gameComparison={[
          { gameId: "relay", plays: 5, completions: 4 },
          { gameId: "dice", plays: 4, completions: 2 },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "학급 질문놀이 학습 현황" })).toBeVisible();
    expect(screen.getByText("최근 6주 변화")).toBeVisible();
    expect(screen.getByText("놀이별 참여 방식")).toBeVisible();
    expect(screen.getByRole("button", { name: "참여 현황" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("놀이별 참여 수치")).toBeVisible();
    expect(screen.getByText(
      "질문 릴레이: 친구와 함께 참여 2명, 학급 참여율 50%, 완료 3회",
    ).closest("ul")).toHaveClass("sr-only");
    expect(screen.getByRole("cell", { name: "2명 (50%) · 완료 3회" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "완료율" }));
    expect(screen.getByText("놀이별 완료율")).toBeVisible();
    expect(screen.getByText("질문 릴레이: 참여 5회 중 완료 4회, 완료율 80%").closest("ul"))
      .toHaveClass("sr-only");
    expect(screen.queryByText("최근 완료한 놀이")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체 이력 보기" })).not.toBeInTheDocument();
  });
});
