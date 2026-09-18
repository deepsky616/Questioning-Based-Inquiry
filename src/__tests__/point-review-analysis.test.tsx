// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sessions, invalidateQueries } = vi.hoisted(() => ({
  sessions: ["session-1", "session-2", "session-3"].map(id => ({ id, date: "2026-09-18", subject: "사회", topic: "유물" })),
  invalidateQueries: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: unknown) => `${key}${values ? JSON.stringify(values) : ""}` }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock("@/lib/app-queries", () => ({ useTeacherSessions: () => ({ data: sessions }) }));
import { usePointReview } from "@/components/teacher/point-review/usePointReview";

let fetchMock: ReturnType<typeof vi.fn>;
let replies: Response[];
const success = () => Response.json({ aiStatus: "success", createdPending: 2, updatedPending: 1, questionCount: 3, commentCount: 1 });
beforeEach(() => {
  replies = [success()];
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/pending")) return Response.json({ pending: [] });
    return replies.shift();
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
async function prepare(ids: string[]) {
  const view = renderHook(() => usePointReview());
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  act(() => ids.forEach(id => view.result.current.toggleAnalysisSession(id)));
  return view;
}

describe("포인트 채점 실행 결과", () => {
  it("중간 수업의 서버 응답이 잘못되어도 나머지를 완료하고 실패 수업만 재선택한다", async () => {
    replies = [success(), new Response("서버 응답 실패", { status: 504 }), success()];
    const { result } = await prepare(["session-1", "session-2", "session-3"]);
    await act(async () => { await result.current.runAnalyze(); });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/analyze"))).toHaveLength(3);
    expect(result.current.selectedAnalysisSessionIds).toEqual(new Set(["session-2"]));
    expect(result.current.message).toContain("analyzePartialDone");
    expect(result.current.message).toContain('"created":4');
    expect(result.current.message).toContain('"updated":2');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/pending"))).toHaveLength(2);
    expect(result.current.busy).toBe(false);
  });

  it("에이아이 실패 시 수업 선택을 유지해 재시도할 수 있다", async () => {
    replies = [Response.json({ aiStatus: "failed", aiErrorType: "invalid_response", createdPending: 0 })];
    const { result } = await prepare(["session-1"]);
    await act(async () => { await result.current.runAnalyze(); });
    expect(result.current.selectedAnalysisSessionIds).toEqual(new Set(["session-1"]));
    expect(result.current.message).toBe("aiErrorInvalidResponse");
  });

  it("비정상 응답을 네트워크 오류나 성공으로 표시하지 않는다", async () => {
    replies = [Response.json({})];
    const { result } = await prepare(["session-1"]);
    await act(async () => { await result.current.runAnalyze(); });
    expect(result.current.message).toBe("analyzeFailed");
    expect(result.current.selectedAnalysisSessionIds).toEqual(new Set(["session-1"]));
  });
});
