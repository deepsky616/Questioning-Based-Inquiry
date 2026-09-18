// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionSequenceEditor } from "@/components/teacher/QuestionSequenceEditor";
import { renderWithIntl } from "@/__tests__/test-utils/render-with-intl";

const questions = ["빛", "물"].map((group, index) => ({
  id: `묶음-${index}`, type: "conceptual", content: "식물에게 어떤 영향을 줄까?",
  source: "student" as const, contentGroup: group, priority: index + 1,
  lessonPhase: "탐구", rationale: `${group}의 영향을 탐구하는 질문입니다.`,
  mergedFrom: [`${group}의 역할은 무엇일까?`, `${group}이 없다면 어떤 일이 일어날까?`],
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("질문 묶음의 검토와 수정", () => {
  it("같은 대표 문장도 번호와 원본 연결 정보를 구분해서 정렬 요청에 전달한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ generatedBy: "ai", sequencedQuestions: [...questions].reverse() }) });
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();
    renderWithIntl(<QuestionSequenceEditor sessionId="수업" editMode initialQuestions={questions} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "② 흐름 기준 정렬" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.currentQuestions).toEqual(questions.map(q => ({
      id: q.id, content: q.content, type: q.type, source: q.source,
      contentGroup: q.contentGroup, mergedFrom: q.mergedFrom,
    })));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([...questions].reverse()));
  });

  it("묶음 근거와 원본을 확인하고 이름을 수정해도 원본은 보존된다", () => {
    const onChange = vi.fn();
    renderWithIntl(<QuestionSequenceEditor sessionId="수업" editMode initialQuestions={[questions[0]]} onChange={onChange} />);
    expect(screen.getByText(questions[0].rationale)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /묶인 질문 2개/ }));
    expect(screen.getByText(`· ${questions[0].mergedFrom[0]}`)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "내용 수정" }));
    expect(screen.getByRole("button", { name: "② 흐름 기준 정렬" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "묶음 이름" }), { target: { value: "빛과 식물의 성장" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onChange).toHaveBeenLastCalledWith([{ ...questions[0], contentGroup: "빛과 식물의 성장" }]);
  });

  it("자동 묶기 실패 안내는 나중에 순서 정렬이 성공해도 남긴다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ generatedBy: "rules", sequencedQuestions: questions }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ generatedBy: "ai", sequencedQuestions: questions }) });
    vi.stubGlobal("fetch", fetchMock);
    renderWithIntl(<QuestionSequenceEditor sessionId="수업" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "① 비슷한 질문 묶기" }));
    expect(await screen.findByText(/자동 묶기를 완료하지 못해/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "② 흐름 기준 정렬" }));
    await screen.findByText(/대표 질문 2개를.*기준으로 정렬했어요/);
    expect(screen.getByText(/자동 묶기를 완료하지 못해/)).toBeVisible();
  });
});
