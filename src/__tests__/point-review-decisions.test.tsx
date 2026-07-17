// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invalidateQueries } = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "resultApproved") return `${values?.count}건 승인됨`;
    if (key === "resultRejected") return `${values?.count}건 거부됨`;
    if (key === "overrideApproved") return `점수 ${values?.points}점으로 수정 후 승인`;
    if (key === "networkError") return "네트워크 오류";
    return key;
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("@/lib/app-queries", () => ({
  useTeacherSessions: () => ({ data: [] }),
}));

import { usePointReview } from "@/components/teacher/point-review/usePointReview";

function response(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let decisionResponse: Response;

beforeEach(() => {
  invalidateQueries.mockReset().mockResolvedValue(undefined);
  decisionResponse = response({ ok: true, count: 1 });
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const href = String(input);
    if (href === "/api/teacher/points/pending") return response({ pending: [] });
    if (href === "/api/teacher/points/decide") return decisionResponse;
    throw new Error(`Unexpected request: ${href}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderReview() {
  const view = renderHook(() => usePointReview());
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith("/api/teacher/points/pending");
  });
  return view;
}

describe("포인트 검토 승인 응답", () => {
  it("응답이 실패이면 승인 성공 문구와 후속 새로고침을 실행하지 않는다", async () => {
    decisionResponse = response({ error: "승인하지 못했습니다" }, false);
    const { result } = await renderReview();

    await act(async () => {
      await result.current.decide("APPROVE", ["log-1", "log-2"]);
    });

    expect(result.current.message).toBe("승인하지 못했습니다");
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/teacher/points/pending")).toHaveLength(1);
  });

  it("성공 응답이어도 실제 반영 수가 0이면 성공으로 표시하지 않는다", async () => {
    decisionResponse = response({ ok: true, count: 0 });
    const { result } = await renderReview();

    await act(async () => {
      await result.current.decide("APPROVE", ["log-1", "log-2"]);
    });

    expect(result.current.message).toBe("네트워크 오류");
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("성공 문구는 요청 수가 아니라 실제 반영 수를 사용한다", async () => {
    decisionResponse = response({ ok: true, count: 1 });
    const { result } = await renderReview();

    await act(async () => {
      await result.current.decide("APPROVE", ["log-1", "log-2", "log-3"]);
    });

    expect(result.current.message).toBe("1건 승인됨");
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledTimes(2));
  });

  it("수정 승인도 반영 수가 0이면 성공으로 표시하지 않는다", async () => {
    decisionResponse = response({ ok: true, count: 0 });
    const { result } = await renderReview();

    await act(async () => {
      await result.current.decideWithOverride("log-1", 4);
    });

    expect(result.current.message).toBe("네트워크 오류");
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("수정 승인 성공 문구에도 실제 반영 수를 표시한다", async () => {
    decisionResponse = response({ ok: true, count: 1 });
    const { result } = await renderReview();

    await act(async () => {
      await result.current.decideWithOverride("log-1", 4);
    });

    expect(result.current.message).toBe("점수 4점으로 수정 후 승인 · 1건 승인됨");
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledTimes(2));
  });
});
