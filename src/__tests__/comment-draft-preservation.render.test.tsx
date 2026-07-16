// @vitest-environment jsdom
/**
 * 댓글 초안 보존 회귀 테스트.
 *
 * 질문 목록은 12초 주기 폴링으로 갱신되는데, 목록 데이터가 바뀔 때
 * 열어둔 댓글 스레드가 리마운트되면 학생이 작성 중이던 댓글 초안이
 * 사라진다. 폴링 갱신을 재현(setQueryData)한 뒤에도 댓글 입력창과
 * 입력 중이던 내용이 그대로 유지되는지 고정한다.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../messages/ko.json";
import { ConfirmProvider } from "@/components/shared/confirm-dialog";
import { ExploreQuestionsView } from "@/components/student/ExploreQuestionsView";
import { MyQuestionsView } from "@/components/student/MyQuestionsView";

// recharts(분류 통계 차트)가 요구하는 ResizeObserver를 jsdom에 제공
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: NoopResizeObserver,
});

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "stu-1", name: "학생일", role: "STUDENT" } },
    status: "authenticated",
  }),
}));

const COMMENT_PLACEHOLDER = "댓글을 입력하세요...";
const DRAFT = "작성 중인 소중한 댓글";

function makeQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: "q-1",
    content: "빛은 왜 굴절되나요?",
    closure: "open",
    cognitive: "factual",
    author: { id: "stu-2", name: "김친구", grade: "3", className: "2", studentNumber: "7" },
    createdAt: "2026-07-01T09:00:00.000Z",
    likeCount: 0,
    commentCount: 0,
    comments: [],
    myLike: false,
    session: null,
    ...overrides,
  };
}

function stubFetch(questions: () => unknown[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (/\/api\/questions\/[^/?]+\/comments/.test(url)) {
      return { ok: true, json: async () => [] } as Response;
    }
    if (url.includes("/api/questions?")) {
      return { ok: true, json: async () => questions() } as Response;
    }
    return { ok: true, json: async () => [] } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderView(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="ko" messages={ko as never} timeZone="Asia/Seoul">
        <ConfirmProvider>{ui}</ConfirmProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("질문탐구(친구 질문) 댓글 초안 보존", () => {
  it("폴링으로 목록 데이터가 갱신되어도 작성 중인 댓글 초안이 유지된다", async () => {
    stubFetch(() => [makeQuestion()]);
    const queryClient = renderView(<ExploreQuestionsView />);

    await screen.findByText("빛은 왜 굴절되나요?");
    fireEvent.click(screen.getByRole("button", { name: /💬/ }));

    const input = await screen.findByPlaceholderText(COMMENT_PLACEHOLDER);
    fireEvent.change(input, { target: { value: DRAFT } });

    // 12초 폴링이 갱신된 목록(예: 친구의 좋아요로 likeCount 변화)을 받아온 상황 재현
    act(() => {
      queryClient.setQueryData(
        ["explore-questions", "all"],
        [makeQuestion({ likeCount: 42 })],
      );
    });
    // react-query 알림은 비동기 배치 — 갱신이 화면에 반영될 때까지 기다린 뒤 검증
    await waitFor(() => expect(screen.queryByText(/42/)).not.toBeNull());

    const after = screen.queryByPlaceholderText(COMMENT_PLACEHOLDER);
    expect(after).not.toBeNull();
    expect(after).toHaveValue(DRAFT);
  });
});

describe("내 질문 댓글 초안 보존", () => {
  it("폴링으로 목록 데이터가 갱신되어도 작성 중인 댓글 초안이 유지된다", async () => {
    const mine = () => [
      makeQuestion({
        author: { id: "stu-1", name: "학생일", grade: "3", className: "2", studentNumber: "1" },
      }),
    ];
    stubFetch(mine);
    const queryClient = renderView(<MyQuestionsView />);

    await screen.findAllByText("빛은 왜 굴절되나요?");
    // jsdom에서는 태블릿·데스크톱 두 레이아웃이 모두 DOM에 존재한다 — 첫 토글 사용
    fireEvent.click(screen.getAllByRole("button", { name: /💬/ })[0]);

    const inputs = await screen.findAllByPlaceholderText(COMMENT_PLACEHOLDER);
    fireEvent.change(inputs[0], { target: { value: DRAFT } });

    act(() => {
      queryClient.setQueryData(
        ["my-questions", "stu-1", "all"],
        [
          makeQuestion({
            likeCount: 42,
            author: { id: "stu-1", name: "학생일", grade: "3", className: "2", studentNumber: "1" },
          }),
        ],
      );
    });
    // react-query 알림은 비동기 배치 — 갱신이 화면에 반영될 때까지 기다린 뒤 검증
    await waitFor(() => expect(screen.queryAllByText(/42/).length).toBeGreaterThan(0));

    const after = screen.queryAllByPlaceholderText(COMMENT_PLACEHOLDER);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]).toHaveValue(DRAFT);
  });
});
