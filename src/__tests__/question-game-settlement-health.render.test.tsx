// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import { QuestionGameSettlementHealthPanel } from "@/components/question-games/QuestionGameSettlementHealthPanel";

describe("교사 질문놀이 포인트 지급 상태", () => {
  it("모두 지급된 경우 관리 화면을 복잡하게 하지 않도록 숨긴다", () => {
    render(
      <QuestionGameSettlementHealthPanel
        health={{
          checkedAt: "2026-07-17T02:00:00.000Z",
          summary: { checked: 2, settled: 2, recovered: 0, pending: 0, failed: 0 },
          items: [],
        }}
        repairing={false}
        onRepair={vi.fn()}
      />,
    );

    expect(screen.queryByText("포인트 지급 상태")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "누락 지급 다시 확인" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("누락과 실패 방은 원인과 복구 동작을 함께 보여 준다", () => {
    const onRepair = vi.fn();
    render(
      <QuestionGameSettlementHealthPanel
        health={{
          checkedAt: "2026-07-17T02:00:00.000Z",
          summary: { checked: 3, settled: 1, recovered: 0, pending: 1, failed: 1 },
          items: [
            {
              code: "1234",
              gameId: "relay",
              completedAt: "2026-07-17T01:00:00.000Z",
              status: "pending",
              reason: "포인트 지급 장부를 찾을 수 없습니다.",
            },
            {
              code: "2345",
              gameId: "dice",
              completedAt: "2026-07-17T01:30:00.000Z",
              status: "failed",
              reason: "자료 저장소 연결 실패",
            },
          ],
        }}
        repairing={false}
        onRepair={onRepair}
      />,
    );

    expect(screen.getByText("확인 필요 2건")).toBeInTheDocument();
    expect(screen.getByText(/방 1234/)).toBeInTheDocument();
    expect(screen.getByText("자료 저장소 연결 실패")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "누락 지급 다시 확인" }));
    expect(onRepair).toHaveBeenCalledOnce();
  });
});
