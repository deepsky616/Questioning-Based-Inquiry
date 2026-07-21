// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
          daily: [
            { date: "2026-07-16", plays: 1, goodQuestions: 2 },
            { date: "2026-07-17", plays: 2, goodQuestions: 4 },
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
    expect(screen.getByText("최근 14일 변화")).toBeVisible();
    expect(screen.getByText("놀이별 참여 방식")).toBeVisible();
    expect(screen.getByText(
      "질문 릴레이: 혼자 하기 완료 0회, 인공지능과 함께 완료 1회, 친구와 함께 완료 2회",
    ).closest("ul")).toHaveClass("sr-only");
    expect(screen.getByText("인정 질문·활동").nextSibling).toHaveTextContent("6");
    expect(screen.getByText(
      "놀이 규칙에 맞게 작성하거나 완료하여 점수에 반영된 질문과 활동이에요.",
    )).toBeVisible();
    expect(screen.getByText("7. 17.: 완료 2회, 인정 질문·활동 4개").closest("ul"))
      .toHaveClass("sr-only");
    expect(screen.getByText("질문 릴레이")).toBeVisible();
    expect(screen.getByText("인정 질문·활동 3개 · 17점")).toBeVisible();
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
          daily: [{ date: "2026-07-17", plays: 8, goodQuestions: 21 }],
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
      />,
    );

    expect(screen.getByRole("heading", { name: "학급 질문놀이 학습 현황" })).toBeVisible();
    expect(screen.getByText("최근 14일 변화")).toBeVisible();
    expect(screen.getByText("놀이별 참여 방식")).toBeVisible();
    expect(screen.getByText("최근 14일 변화").closest("figure")?.parentElement)
      .not.toHaveClass("lg:grid-cols-2");
    expect(screen.queryByRole("button", { name: "완료율" })).not.toBeInTheDocument();
    expect(screen.queryByText("놀이별 완료율")).not.toBeInTheDocument();
    const modeSelector = screen.getByRole("group", { name: "놀이 방식 선택" });
    expect(within(modeSelector).getByRole("button", { name: "모두 비교" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("놀이별 참여 수치")).toBeVisible();
    expect(screen.getByText(
      "질문 릴레이: 친구와 함께 참여 2명, 학급 참여율 50%, 완료 3회",
    ).closest("ul")).toHaveClass("sr-only");
    expect(screen.getByRole("cell", { name: "2명 (50%) · 완료 3회" })).toBeVisible();

    fireEvent.click(within(modeSelector).getByRole("button", { name: "친구와 함께" }));
    expect(within(modeSelector).getByRole("button", { name: "친구와 함께" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", {
      name: "질문놀이별 친구와 함께 참여한 학생 비율 그래프",
    })).toBeVisible();
    const participationTable = screen.getByText("놀이별 참여 수치").closest("table");
    expect(participationTable).not.toBeNull();
    expect(within(participationTable!).getByRole("columnheader", { name: "친구와 함께" }))
      .toBeVisible();
    expect(within(participationTable!).queryByRole("columnheader", { name: "혼자 하기" }))
      .not.toBeInTheDocument();
    expect(within(participationTable!).queryByRole("columnheader", { name: "인공지능과 함께" }))
      .not.toBeInTheDocument();

    expect(screen.getByRole("group", { name: "놀이 방식 선택" })).toBeVisible();
    expect(screen.getByText("최근 14일 변화")).toBeVisible();
    expect(screen.queryByText("최근 완료한 놀이")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "전체 이력 보기" })).not.toBeInTheDocument();
  });
});
