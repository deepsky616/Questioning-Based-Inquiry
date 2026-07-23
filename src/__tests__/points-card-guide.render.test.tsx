// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import PointsCard from "@/components/shared/PointsCard";

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({
      data: {
        totalPoints: 10,
        recent: [],
        ranks: { class: 1, school: 2, all: 3 },
      },
      isSuccess: true,
    }),
  };
});

describe("학생 대시보드 포인트 획득 안내", () => {
  it("질문놀이와 질문연습의 하루 상한 및 다른 지급 제한을 정확히 안내한다", () => {
    render(<PointsCard />);

    fireEvent.click(screen.getByRole("button", { name: /포인트 획득 방법/ }));

    expect(screen.getByText("인정된 질문 활동 1개당")).toBeInTheDocument();
    expect(screen.getByText(/혼자 하기 30점.*인공지능과 함께 50점.*친구와 함께 120점/))
      .toBeInTheDocument();
    expect(screen.getByText(/모든 질문놀이 포인트를 합쳐 계산.*세 방식은 서로 따로.*매일 자정/))
      .toBeInTheDocument();
    expect(screen.getByText("질문 연습")).toBeInTheDocument();
    expect(screen.getByText(/질문 연습은 하루 최대 15점/)).toBeInTheDocument();
    expect(screen.getByText(/하루 상한 대신 작성한 내용마다 한 번만/)).toBeInTheDocument();
    expect(screen.getByText(/특별상은 최대 3개.*합계 15점/)).toBeInTheDocument();
    expect(screen.getByText(/질문수업.*학생 한 명당 수업별 합계 15점/)).toBeInTheDocument();
  });
});
