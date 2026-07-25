// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import PointsCard from "@/components/shared/PointsCard";

const refetch = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({
      data: undefined,
      isSuccess: false,
      isError: true,
      isFetching: false,
      refetch,
    }),
  };
});

describe("학생 대시보드 포인트 오류 복구", () => {
  it("자료 조회가 실패하면 오류를 알리고 사용자가 다시 불러올 수 있다", () => {
    render(<PointsCard />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "포인트 자료를 불러오지 못했습니다.",
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
