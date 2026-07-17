// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import RelayGame from "@/app/(student)/student-question-play/games/RelayGame";
import { BUILT_IN_GAMES } from "@/lib/question-games-data";

const aiMocks = vi.hoisted(() => ({ ask: vi.fn() }));

vi.mock("@/app/(student)/student-question-play/games/useAIPlay", () => ({
  useAIPlay: () => ({ ask: aiMocks.ask, loading: false, error: null }),
}));

Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

const game = BUILT_IN_GAMES.find((item) => item.id === "relay")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function runSnapshot(
  id: string,
  version: number,
  questionCount: number,
  status = "ACTIVE",
  mode: "SOLO" | "AI" = "SOLO",
  aiTurnCount = 0,
  awaitingAiTurn = false,
) {
  return {
    id,
    gameId: "relay",
    mode,
    status,
    version,
    targetCount: 3,
    questionCount,
    aiTurnCount,
    awaitingAiTurn,
    preview: false,
  };
}

function requestBody(call: unknown[]) {
  return JSON.parse(String((call[1] as RequestInit | undefined)?.body));
}

function soloSettlementResult() {
  return {
    awarded: 5,
    dailyLimit: 30,
    dailyRemaining: 25,
    cappedByLimit: false,
    preview: false,
  };
}

function responseWithOptionalResult(run: unknown, result: unknown) {
  return result === undefined ? { run } : { run, result };
}

function renderRelay(mode: "solo" | "ai" = "solo", queryClient?: QueryClient) {
  return render(
    <RelayGame
      game={game}
      onBack={vi.fn()}
      config={{
        mode,
        players: mode === "ai" ? ["민준", "AI"] : ["민준"],
      }}
    />,
    { queryClient },
  );
}

function chooseTopicAndStart() {
  fireEvent.click(screen.getByRole("button", { name: "우주" }));
  fireEvent.click(screen.getByRole("button", { name: /질문 릴레이 시작/ }));
}

async function submitQuestion(question: string) {
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: /질문 (제출|연결)/ }));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function installSuccessfulServer(
  awarded = 5,
  resultOverrides: Partial<{
    dailyLimit: number;
    dailyRemaining: number;
    cappedByLimit: boolean;
    preview: boolean;
  }> = {},
) {
  let createCount = 0;
  const states = new Map<string, { version: number; questionCount: number }>();
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (url === "/api/question-games/runs") {
      createCount += 1;
      const id = `run-${createCount}`;
      states.set(id, { version: 1, questionCount: 0 });
      return jsonResponse({ run: runSnapshot(id, 1, 0) }, 201);
    }

    const match = url.match(/^\/api\/question-games\/runs\/([^/]+)\/(actions|complete|result)$/);
    if (!match) return jsonResponse({ error: "알 수 없는 요청" }, 404);
    const [, id, operation] = match;
    const state = states.get(id);
    if (!state) return jsonResponse({ error: "실행 없음" }, 404);

    if (operation === "actions") {
      state.questionCount += 1;
      state.version += 1;
      return jsonResponse({
        run: runSnapshot(id, state.version, state.questionCount),
      });
    }

    if (operation === "complete") {
      state.version += 1;
      return jsonResponse({
        run: runSnapshot(id, state.version, state.questionCount, "SETTLED"),
        result: {
          awarded,
          dailyLimit: 30,
          dailyRemaining: 30 - awarded,
          cappedByLimit: false,
          preview: false,
          ...resultOverrides,
        },
      });
    }

    return jsonResponse({
      run: runSnapshot(id, state.version, state.questionCount),
      result: null,
    });
  });
}

function installSuccessfulAiServer(awarded = 9) {
  const state = {
    version: 1,
    questionCount: 0,
    aiTurnCount: 0,
    status: "ACTIVE",
  };
  const outputFor = (index: number) => `인공지능 연결 질문 ${index}은 무엇인가요?`;
  const snapshot = () => runSnapshot(
    "run-ai",
    state.version,
    state.questionCount,
    state.status,
    "AI",
    state.aiTurnCount,
    state.questionCount === state.aiTurnCount + 1 && state.questionCount < 3,
  );

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (url === "/api/question-games/runs") {
      return jsonResponse({ run: snapshot() }, 201);
    }
    if (url.endsWith("/ai-turn")) {
      const next = state.aiTurnCount + 1;
      return jsonResponse({
        output: outputFor(next),
        proof: `proof-${next}`,
        proofId: `proof-id-${next}`,
        expiresAt: "2099-07-16T03:01:30.000Z",
        runVersion: state.version,
      });
    }
    if (url.endsWith("/actions")) {
      if (body.action === "relay-submit-question") {
        if (state.questionCount === state.aiTurnCount + 1 && state.questionCount < 3) {
          return jsonResponse({ error: "지금은 인공지능 질문 차례입니다" }, 409);
        }
        state.questionCount += 1;
      } else if (body.action === "relay-record-ai-turn") {
        state.aiTurnCount += 1;
      } else {
        return jsonResponse({ error: "알 수 없는 동작" }, 400);
      }
      state.version += 1;
      return jsonResponse({ run: snapshot() });
    }
    if (url.endsWith("/complete")) {
      state.version += 1;
      state.status = "SETTLED";
      return jsonResponse({
        run: snapshot(),
        result: {
          awarded,
          dailyLimit: 50,
          dailyRemaining: 50 - awarded,
          cappedByLimit: false,
          preview: false,
        },
      });
    }
    if (url.endsWith("/result")) {
      return jsonResponse({ run: snapshot(), result: null });
    }
    return jsonResponse({ error: "알 수 없는 요청" }, 404);
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  aiMocks.ask.mockReset();
  aiMocks.ask.mockResolvedValue(null);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("이어 말하기 서버 실행 화면", () => {
  it("서버 실행 생성이 성공한 뒤에만 놀이 화면으로 이동한다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "실행 생성 실패" }, 500))
      .mockResolvedValueOnce(jsonResponse({ run: runSnapshot("run-1", 1, 0) }, 201));
    renderRelay();

    chooseTopicAndStart();

    expect(await screen.findByRole("alert")).toHaveTextContent("실행 생성 실패");
    expect(screen.getByRole("button", { name: /질문 릴레이 시작/ })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /질문 릴레이 시작/ }));
    expect(await screen.findByPlaceholderText(/첫 번째 질문/)).toBeVisible();

    const createBodies = fetchMock.mock.calls.map(requestBody);
    expect(createBodies[0]).toMatchObject({
      gameId: "relay",
      mode: "solo",
      topic: "우주",
      locale: "ko",
    });
    expect(createBodies[1].requestId).toBe(createBodies[0].requestId);
  });

  it("닫힌 실행 생성 응답은 열지 않고 다음 시도에서 새 생성 식별값을 쓴다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        run: runSnapshot("old-run", 2, 0, "ABANDONED"),
      }))
      .mockResolvedValueOnce(jsonResponse({
        run: runSnapshot("new-run", 1, 0),
      }, 201));
    renderRelay();

    chooseTopicAndStart();

    expect(await screen.findByRole("alert")).toHaveTextContent("이미 닫힌 질문놀이 실행입니다");
    expect(screen.getByRole("button", { name: /질문 릴레이 시작/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /질문 릴레이 시작/ }));

    expect(await screen.findByPlaceholderText(/첫 번째 질문/)).toBeVisible();
    const createBodies = fetchMock.mock.calls.map(requestBody);
    expect(createBodies).toHaveLength(2);
    expect(createBodies[1].requestId).not.toBe(createBodies[0].requestId);
  });

  it("서버가 질문을 명시적으로 거절하고 실행이 그대로면 입력을 고쳐 새 요청을 보낸다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ run: runSnapshot("run-1", 1, 0) }, 201))
      .mockResolvedValueOnce(jsonResponse({ error: "질문 형식을 확인해 주세요" }, 400))
      .mockResolvedValueOnce(jsonResponse({
        run: runSnapshot("run-1", 1, 0),
        result: null,
      }))
      .mockResolvedValueOnce(jsonResponse({ run: runSnapshot("run-1", 2, 1) }));
    renderRelay();
    chooseTopicAndStart();
    const input = await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("우주에는 무엇이 있나요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("질문 형식을 확인해 주세요");
    expect(input).not.toHaveAttribute("readonly");
    expect(input).toHaveValue("우주에는 무엇이 있나요?");
    expect(screen.queryByText("우주에는 무엇이 있나요?", { selector: "div" }))
      .not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "우주에는 어떤 별이 있나요?" } });
    fireEvent.click(screen.getByRole("button", { name: /질문 연결/ }));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.getByText("우주에는 어떤 별이 있나요?", { selector: "div" })).toBeVisible();

    const actionCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/actions"));
    expect(actionCalls).toHaveLength(2);
    expect(requestBody(actionCalls[1])).toMatchObject({
      question: "우주에는 어떤 별이 있나요?",
    });
    expect(requestBody(actionCalls[1]).requestId).not.toBe(requestBody(actionCalls[0]).requestId);
  });

  it("서버가 질문을 명시적으로 거절하면 실행 조회도 실패해도 입력을 고칠 수 있다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ run: runSnapshot("run-1", 1, 0) }, 201))
      .mockResolvedValueOnce(jsonResponse({ error: "질문을 저장할 수 없습니다" }, 400))
      .mockRejectedValueOnce(new TypeError("실행 상태 조회 실패"))
      .mockResolvedValueOnce(jsonResponse({ run: runSnapshot("run-1", 2, 1) }));
    renderRelay();
    chooseTopicAndStart();
    const input = await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("거절된 원래 질문인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("질문을 저장할 수 없습니다");
    expect(input).not.toHaveAttribute("readonly");
    fireEvent.change(input, { target: { value: "고쳐서 다시 보낼 질문인가요?" } });
    fireEvent.click(screen.getByRole("button", { name: /질문 연결/ }));
    await waitFor(() => expect(input).toHaveValue(""));

    const actionBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/actions"))
      .map(requestBody);
    expect(actionBodies).toHaveLength(2);
    expect(actionBodies[1]).toMatchObject({ question: "고쳐서 다시 보낼 질문인가요?" });
    expect(actionBodies[1].requestId).not.toBe(actionBodies[0].requestId);
  });

  it("질문 응답 유실 뒤 실행이 그대로면 원문을 잠그고 같은 요청만 다시 확인한다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ run: runSnapshot("run-1", 1, 0) }, 201))
      .mockRejectedValueOnce(new TypeError("질문 응답 끊김"))
      .mockResolvedValueOnce(jsonResponse({
        run: runSnapshot("run-1", 1, 0),
        result: null,
      }))
      .mockResolvedValueOnce(jsonResponse({ run: runSnapshot("run-1", 2, 1) }));
    renderRelay();
    chooseTopicAndStart();
    const input = await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("다시 확인할 원래 질문인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("질문 응답 끊김");
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveValue("다시 확인할 원래 질문인가요?");
    expect(screen.getByRole("button", { name: "질문 저장 다시 확인" })).toBeVisible();

    fireEvent.change(input, { target: { value: "새 문구로 바꾼 질문인가요?" } });
    expect(input).toHaveValue("다시 확인할 원래 질문인가요?");
    fireEvent.click(screen.getByRole("button", { name: "질문 저장 다시 확인" }));
    await waitFor(() => expect(input).toHaveValue(""));

    const actionBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/actions"))
      .map(requestBody);
    expect(actionBodies).toHaveLength(2);
    expect(actionBodies[1]).toMatchObject({
      requestId: actionBodies[0].requestId,
      question: "다시 확인할 원래 질문인가요?",
    });
    expect(actionBodies.some((body) => body.question === "새 문구로 바꾼 질문인가요?"))
      .toBe(false);
  });

  it("서버가 질문을 저장한 뒤 응답만 끊기면 결과 조회로 성공을 복구한다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-1", 1, 0) }, 201);
      }
      if (url.endsWith("/actions")) {
        throw new TypeError("응답 연결 끊김");
      }
      if (url.endsWith("/result")) {
        return jsonResponse({
          run: runSnapshot("run-1", 2, 1),
          result: null,
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay();
    chooseTopicAndStart();
    const input = await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("응답이 끊겨도 저장된 질문인가요?");

    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.getByText("응답이 끊겨도 저장된 질문인가요?", { selector: "div" }))
      .toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/actions")))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/result")))
      .toHaveLength(1);
  });

  it.each([
    ["실행 식별값", runSnapshot("other-run", 2, 1)],
    ["버전", runSnapshot("run-1", 3, 1)],
    ["질문 수", runSnapshot("run-1", 2, 0)],
    ["인공지능 차례 수", runSnapshot("run-1", 2, 1, "ACTIVE", "SOLO", 1)],
  ])("성공 응답의 %s 진행값이 맞지 않으면 질문을 저장한 것으로 표시하지 않는다", async (
    _field,
    invalidRun,
  ) => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ run: runSnapshot("run-1", 1, 0) }, 201))
      .mockResolvedValueOnce(jsonResponse({ run: invalidRun }))
      .mockResolvedValueOnce(jsonResponse({
        run: runSnapshot("run-1", 1, 0),
        result: null,
      }));
    renderRelay();
    chooseTopicAndStart();
    const input = await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("진행값이 맞는 응답인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("질문 저장 결과를 확인할 수 없습니다");
    expect(input).toHaveValue("진행값이 맞는 응답인가요?");
    expect(screen.queryByText("진행값이 맞는 응답인가요?", { selector: "div" }))
      .not.toBeInTheDocument();
  });

  it("실패 조회에서 실행이 두 단계 앞서면 옛 요청을 버리고 새 실행으로 돌아간다", async () => {
    let createCount = 0;
    let firstActionRequestId = "";
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        createCount += 1;
        return jsonResponse({ run: runSnapshot(`run-${createCount}`, 1, 0) }, 201);
      }
      if (url.endsWith("/actions")) {
        if (createCount === 1) {
          firstActionRequestId = body.requestId;
          return jsonResponse({ error: "질문 저장 응답 실패" }, 500);
        }
        return jsonResponse({ run: runSnapshot("run-2", 2, 1) });
      }
      if (url.endsWith("/result")) {
        return jsonResponse({
          run: runSnapshot("run-1", 3, 2),
          result: null,
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay();
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("다른 화면과 겹친 질문인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("다른 화면에서 변경되었습니다");
    expect(screen.getByRole("button", { name: "새 실행으로 돌아가기" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "이어 갈 질문 입력" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "새 실행으로 돌아가기" }));
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);
    await submitQuestion("다른 화면과 겹친 질문인가요?");

    const actionBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/actions"))
      .map(requestBody);
    expect(actionBodies).toHaveLength(2);
    expect(actionBodies[1].requestId).not.toBe(firstActionRequestId);
    expect(screen.queryByRole("button", { name: "새 실행으로 돌아가기" }))
      .not.toBeInTheDocument();
  });

  it("재생 응답보다 현재 실행이 앞서면 과거 상태로 화면을 되돌리지 않는다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ run: runSnapshot("run-1", 1, 0) }, 201))
      .mockResolvedValueOnce(jsonResponse({
        run: runSnapshot("run-1", 2, 1),
        replayed: true,
      }))
      .mockResolvedValueOnce(jsonResponse({
        run: runSnapshot("run-1", 3, 2),
        result: null,
      }));
    renderRelay();
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("재생 응답은 최신 상태인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("다른 화면에서 변경되었습니다");
    expect(screen.getByText("2 / 3")).toBeVisible();
    expect(screen.queryByText("재생 응답은 최신 상태인가요?", { selector: "div" }))
      .not.toBeInTheDocument();
  });

  it("질문 처리 여부 조회도 실패하면 원문을 잠그고 같은 요청으로 다시 확인한다", async () => {
    let actionAttempts = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-1", 1, 0) }, 201);
      }
      if (url.endsWith("/actions")) {
        actionAttempts += 1;
        if (actionAttempts === 1) throw new TypeError("질문 응답 끊김");
        return jsonResponse({ run: runSnapshot("run-1", 2, 1) });
      }
      if (url.endsWith("/result")) throw new TypeError("상태 조회 끊김");
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay();
    chooseTopicAndStart();
    const input = await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("확인이 필요한 원래 질문인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("질문 응답 끊김");
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute("readonly");
    expect(input).not.toHaveStyle({ opacity: "0.5" });
    expect(input).toHaveValue("확인이 필요한 원래 질문인가요?");
    expect(screen.getByRole("button", { name: /목록/ })).toBeDisabled();
    fireEvent.change(input, { target: { value: "바꾸려는 질문인가요?" } });
    expect(input).toHaveValue("확인이 필요한 원래 질문인가요?");

    fireEvent.click(screen.getByRole("button", { name: "질문 저장 다시 확인" }));
    await waitFor(() => expect(input).toHaveValue(""));

    const actionCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/actions"));
    expect(actionCalls).toHaveLength(2);
    expect(requestBody(actionCalls[1])).toMatchObject({
      requestId: requestBody(actionCalls[0]).requestId,
      question: "확인이 필요한 원래 질문인가요?",
    });
  });

  it("마지막 질문 자동 정산 결과를 받으면 별도 완료 요청 없이 결과 화면으로 간다", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    let version = 1;
    let questionCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-1", version, questionCount) }, 201);
      }
      if (url.endsWith("/actions")) {
        version += 1;
        questionCount += 1;
        const settled = questionCount === 3;
        return jsonResponse({
          run: runSnapshot("run-1", version, questionCount, settled ? "SETTLED" : "ACTIVE"),
          ...(settled ? { result: soloSettlementResult() } : {}),
        });
      }
      return jsonResponse({ error: "별도 완료 요청은 없어야 합니다" }, 500);
    });
    renderRelay("solo", queryClient);
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("첫 질문은 무엇인가요?");
    await submitQuestion("둘째 질문은 무엇인가요?");
    await submitQuestion("셋째 질문은 무엇인가요?");

    expect(await screen.findByText("릴레이 완성!")).toBeVisible();
    expect(screen.getByText("+5점 적립!")).toBeVisible();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["points-card"] });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/complete")))
      .toHaveLength(0);
  });

  it("자동 정산 응답이 끊기면 결과 조회로 복구하고 별도 완료 요청을 보내지 않는다", async () => {
    let version = 1;
    let questionCount = 0;
    let settled = false;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-1", version, questionCount) }, 201);
      }
      if (url.endsWith("/actions")) {
        version += 1;
        questionCount += 1;
        if (questionCount === 3) {
          settled = true;
          throw new TypeError("자동 정산 응답 끊김");
        }
        return jsonResponse({ run: runSnapshot("run-1", version, questionCount) });
      }
      if (url.endsWith("/result")) {
        return jsonResponse({
          run: runSnapshot("run-1", version, questionCount, settled ? "SETTLED" : "ACTIVE"),
          result: settled ? { ...soloSettlementResult(), alreadySettled: true } : null,
        });
      }
      return jsonResponse({ error: "별도 완료 요청은 없어야 합니다" }, 500);
    });
    renderRelay();
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("첫 질문은 무엇인가요?");
    await submitQuestion("둘째 질문은 무엇인가요?");
    await submitQuestion("셋째 질문은 무엇인가요?");

    expect(await screen.findByText("릴레이 완성!")).toBeVisible();
    expect(screen.getByText("+5점 적립!")).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/result")))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/complete")))
      .toHaveLength(0);
  });

  it("자동 정산 응답과 첫 조회를 모두 잃으면 같은 질문 동작 재생으로 복구한다", async () => {
    let version = 1;
    let questionCount = 0;
    let finalAttempts = 0;
    let resultReads = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-1", version, questionCount) }, 201);
      }
      if (url.endsWith("/actions")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (questionCount < 2) {
          version += 1;
          questionCount += 1;
          return jsonResponse({ run: runSnapshot("run-1", version, questionCount) });
        }
        finalAttempts += 1;
        if (finalAttempts === 1) {
          version += 1;
          questionCount += 1;
          throw new TypeError("자동 정산 응답 유실");
        }
        return jsonResponse({
          run: runSnapshot("run-1", version, questionCount, "SETTLED"),
          result: soloSettlementResult(),
          replayed: true,
          echoedRequestId: body.requestId,
        });
      }
      if (url.endsWith("/result")) {
        resultReads += 1;
        if (resultReads === 1) throw new TypeError("첫 결과 조회 유실");
        return jsonResponse({
          run: runSnapshot("run-1", version, questionCount, "SETTLED"),
          result: { ...soloSettlementResult(), alreadySettled: true },
        });
      }
      return jsonResponse({ error: "별도 완료 요청은 없어야 합니다" }, 500);
    });
    renderRelay();
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);
    await submitQuestion("첫 질문은 무엇인가요?");
    await submitQuestion("둘째 질문은 무엇인가요?");
    await submitQuestion("셋째 질문은 무엇인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("자동 정산 응답 유실");
    fireEvent.click(screen.getByRole("button", { name: "질문 저장 다시 확인" }));

    expect(await screen.findByText("+5점 적립!")).toBeVisible();
    const actionCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/actions"));
    expect(actionCalls).toHaveLength(4);
    expect(requestBody(actionCalls[3]).requestId).toBe(requestBody(actionCalls[2]).requestId);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/complete")))
      .toHaveLength(0);
  });

  it.each([
    ["누락", undefined],
    ["빈 값", null],
    ["손상", { ...soloSettlementResult(), awarded: "5" }],
  ])("자동 정산 result가 %s이면 결과 화면으로 가지 않는다", async (_case, invalidResult) => {
    let version = 1;
    let questionCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-1", version, questionCount) }, 201);
      }
      if (url.endsWith("/actions")) {
        version += 1;
        questionCount += 1;
        if (questionCount < 3) {
          return jsonResponse({ run: runSnapshot("run-1", version, questionCount) });
        }
        return jsonResponse(responseWithOptionalResult(
          runSnapshot("run-1", version, questionCount, "SETTLED"),
          invalidResult,
        ));
      }
      if (url.endsWith("/result")) {
        return jsonResponse(responseWithOptionalResult(
          runSnapshot("run-1", version, questionCount, "SETTLED"),
          invalidResult,
        ));
      }
      return jsonResponse({ error: "별도 완료 요청은 없어야 합니다" }, 500);
    });
    renderRelay();
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);
    await submitQuestion("첫 질문은 무엇인가요?");
    await submitQuestion("둘째 질문은 무엇인가요?");
    await submitQuestion("셋째 질문은 무엇인가요?");

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByText("릴레이 완성!")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "이어 갈 질문 입력" }))
      .toHaveValue("셋째 질문은 무엇인가요?");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/complete")))
      .toHaveLength(0);
  });

  it("이전 서버의 마지막 ACTIVE 응답은 별도 완료 요청과 결과로 호환한다", async () => {
    fetchMock = installSuccessfulServer(5);
    vi.stubGlobal("fetch", fetchMock);
    renderRelay();
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("우주에는 무엇이 있나요?");
    await submitQuestion("그 별은 왜 빛나나요?");
    await submitQuestion("그 빛은 어디까지 가나요?");

    expect(await screen.findByText("릴레이 완성!")).toBeVisible();
    expect(screen.getByText("+5점 적립!")).toBeVisible();

    const actionCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/actions"));
    expect(actionCalls).toHaveLength(3);
    expect(actionCalls.map(requestBody)).toEqual([
      expect.objectContaining({
        action: "relay-submit-question",
        expectedVersion: 1,
        question: "우주에는 무엇이 있나요?",
        locale: "ko",
      }),
      expect.objectContaining({ expectedVersion: 2, question: "그 별은 왜 빛나나요?" }),
      expect.objectContaining({ expectedVersion: 3, question: "그 빛은 어디까지 가나요?" }),
    ]);
    const completeCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/complete"));
    expect(completeCall).toBeDefined();
    expect(requestBody(completeCall!)).toMatchObject({ expectedVersion: 4 });
  });

  it("서버 완료 뒤 응답만 끊기면 결과 조회로 지급 결과를 복구한다", async () => {
    let version = 1;
    let questionCount = 0;
    let settled = false;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-1", version, questionCount) }, 201);
      }
      if (url.endsWith("/actions")) {
        version += 1;
        questionCount += 1;
        return jsonResponse({ run: runSnapshot("run-1", version, questionCount) });
      }
      if (url.endsWith("/complete")) {
        version += 1;
        settled = true;
        throw new TypeError("완료 응답 끊김");
      }
      if (url.endsWith("/result")) {
        return jsonResponse({
          run: runSnapshot("run-1", version, questionCount, settled ? "SETTLED" : "ACTIVE"),
          result: settled ? {
            awarded: 5,
            dailyLimit: 30,
            dailyRemaining: 25,
            cappedByLimit: false,
            preview: false,
          } : null,
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay();
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("첫 질문은 무엇인가요?");
    await submitQuestion("둘째 질문은 무엇인가요?");
    await submitQuestion("셋째 질문은 무엇인가요?");

    expect(await screen.findByText("릴레이 완성!")).toBeVisible();
    expect(screen.getByText("+5점 적립!")).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/complete")))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/result")))
      .toHaveLength(1);
  });

  it("완료와 결과 조회가 미완료를 확인하면 같은 완료 요청으로 다시 지급한다", async () => {
    let version = 1;
    let questionCount = 0;
    let completeAttempts = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-1", version, questionCount) }, 201);
      }
      if (url.endsWith("/actions")) {
        version += 1;
        questionCount += 1;
        return jsonResponse({ run: runSnapshot("run-1", version, questionCount) });
      }
      if (url.endsWith("/complete")) {
        completeAttempts += 1;
        if (completeAttempts === 1) {
          return jsonResponse({ error: "완료 저장 실패" }, 500);
        }
        version += 1;
        return jsonResponse({
          run: runSnapshot("run-1", version, questionCount, "SETTLED"),
          result: {
            awarded: 5,
            dailyLimit: 30,
            dailyRemaining: 25,
            cappedByLimit: false,
            preview: false,
          },
        });
      }
      if (url.endsWith("/result")) {
        return jsonResponse({
          run: runSnapshot("run-1", version, questionCount),
          result: null,
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay();
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);
    await submitQuestion("첫 질문은 무엇인가요?");
    await submitQuestion("둘째 질문은 무엇인가요?");
    await submitQuestion("셋째 질문은 무엇인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("완료 저장 실패");
    expect(screen.getByText("질문은 저장되었어요. 포인트 지급을 마무리해 주세요.")).toBeVisible();
    expect(screen.getByRole("button", { name: /목록/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "포인트 다시 받기" }));

    expect(await screen.findByText("+5점 적립!")).toBeVisible();
    const completeCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/complete"));
    expect(completeCalls).toHaveLength(2);
    expect(requestBody(completeCalls[1]).requestId)
      .toBe(requestBody(completeCalls[0]).requestId);
  });

  it("인공지능 질문을 발급하고 기록한 뒤에만 화면에 넣고 일곱 번째 버전에서 끝낸다", async () => {
    fetchMock = installSuccessfulAiServer();
    vi.stubGlobal("fetch", fetchMock);
    renderRelay("ai");
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    const studentQuestions = [
      "학생 첫 질문은 무엇인가요?",
      "학생 둘째 질문은 무엇인가요?",
      "학생 셋째 질문은 무엇인가요?",
    ];
    for (const question of studentQuestions) await submitQuestion(question);

    expect(await screen.findByText("+9점 적립!")).toBeVisible();
    const actionBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/actions"))
      .map(requestBody);
    const studentBodies = actionBodies.filter((body) => body.action === "relay-submit-question");
    const aiRecordBodies = actionBodies.filter((body) => body.action === "relay-record-ai-turn");
    expect(studentBodies.map((body) => body.question)).toEqual(studentQuestions);
    expect(studentBodies.map((body) => body.expectedVersion)).toEqual([1, 3, 5]);
    expect(aiRecordBodies.map((body) => body.expectedVersion)).toEqual([2, 4]);
    expect(aiRecordBodies.map((body) => body.output)).toEqual([
      "인공지능 연결 질문 1은 무엇인가요?",
      "인공지능 연결 질문 2은 무엇인가요?",
    ]);
    const issueBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/ai-turn"))
      .map(requestBody);
    expect(issueBodies).toHaveLength(2);
    expect(issueBodies.map((body) => body.expectedVersion)).toEqual([2, 4]);
    expect(issueBodies.map((body) => body.previousQuestion)).toEqual(studentQuestions.slice(0, 2));
    expect(issueBodies.every((body) => body.topic === "우주" && body.locale === "ko")).toBe(true);
    expect(aiRecordBodies.map((body) => body.generationRequestId))
      .toEqual(issueBodies.map((body) => body.requestId));
    expect(aiRecordBodies.every((body, index) => body.requestId !== issueBodies[index].requestId))
      .toBe(true);
    const completeCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/complete"));
    expect(requestBody(completeCall!)).toMatchObject({ expectedVersion: 6 });
    expect(screen.getByText("인공지능 연결 질문 1은 무엇인가요?")).toBeVisible();
    expect(screen.getByText("인공지능 연결 질문 2은 무엇인가요?")).toBeVisible();
  });

  it("인공지능 기록 실패 시 발급 결과를 숨긴 채 같은 기록 요청만 다시 보낸다", async () => {
    let recordAttempts = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-ai", 1, 0, "ACTIVE", "AI") }, 201);
      }
      if (url.endsWith("/ai-turn")) {
        return jsonResponse({
          output: "기록 뒤에만 보일 질문은 무엇인가요?",
          proof: "kept-proof",
          expiresAt: "2099-07-16T03:01:30.000Z",
          runVersion: 2,
        });
      }
      if (url.endsWith("/actions") && body.action === "relay-submit-question") {
        return jsonResponse({
          run: runSnapshot("run-ai", 2, 1, "ACTIVE", "AI", 0, true),
        });
      }
      if (url.endsWith("/actions") && body.action === "relay-record-ai-turn") {
        recordAttempts += 1;
        if (recordAttempts === 1) return jsonResponse({ error: "인공지능 기록 실패" }, 500);
        return jsonResponse({
          run: runSnapshot("run-ai", 3, 1, "ACTIVE", "AI", 1, false),
        });
      }
      if (url.endsWith("/result")) {
        return jsonResponse({
          run: runSnapshot("run-ai", 2, 1, "ACTIVE", "AI", 0, true),
          result: null,
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay("ai");
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("첫 학생 질문은 무엇인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("인공지능 기록 실패");
    expect(screen.queryByText("기록 뒤에만 보일 질문은 무엇인가요?")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "이어 갈 질문 입력" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "인공지능 차례 다시 시도" }));

    expect((await screen.findAllByText("기록 뒤에만 보일 질문은 무엇인가요?")).length)
      .toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: "이어 갈 질문 입력" })).toBeEnabled();
    const issueCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/ai-turn"));
    const recordCalls = fetchMock.mock.calls.filter(([url, init]) =>
      String(url).endsWith("/actions") && requestBody([url, init]).action === "relay-record-ai-turn",
    );
    expect(issueCalls).toHaveLength(1);
    expect(recordCalls).toHaveLength(2);
    expect(requestBody(recordCalls[1])).toEqual(requestBody(recordCalls[0]));
  });

  it("인공지능 기록 응답이 끊겨도 상태 조회에서 진전을 확인하고 질문을 보여 준다", async () => {
    let recorded = false;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-ai", 1, 0, "ACTIVE", "AI") }, 201);
      }
      if (url.endsWith("/ai-turn")) {
        return jsonResponse({
          output: "복구된 인공지능 질문은 무엇인가요?",
          proof: "recovery-proof",
          expiresAt: "2099-07-16T03:01:30.000Z",
          runVersion: 2,
        });
      }
      if (url.endsWith("/actions") && body.action === "relay-submit-question") {
        return jsonResponse({
          run: runSnapshot("run-ai", 2, 1, "ACTIVE", "AI", 0, true),
        });
      }
      if (url.endsWith("/actions") && body.action === "relay-record-ai-turn") {
        recorded = true;
        throw new TypeError("기록 응답 끊김");
      }
      if (url.endsWith("/result") && recorded) {
        return jsonResponse({
          run: runSnapshot("run-ai", 3, 1, "ACTIVE", "AI", 1, false),
          result: null,
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay("ai");
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("응답 복구를 시험하는 질문인가요?");

    expect((await screen.findAllByText("복구된 인공지능 질문은 무엇인가요?")).length)
      .toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/ai-turn"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/result"))).toHaveLength(1);
  });

  it("인공지능 기록 재생 응답이 최신 실행보다 뒤면 과거 질문을 화면에 넣지 않는다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-ai", 1, 0, "ACTIVE", "AI") }, 201);
      }
      if (url.endsWith("/actions") && body.action === "relay-submit-question") {
        return jsonResponse({
          run: runSnapshot("run-ai", 2, 1, "ACTIVE", "AI", 0, true),
        });
      }
      if (url.endsWith("/ai-turn")) {
        return jsonResponse({
          output: "과거 재생 질문은 무엇인가요?",
          proof: "replayed-proof",
          expiresAt: "2099-07-16T03:01:30.000Z",
          runVersion: 2,
        });
      }
      if (url.endsWith("/actions") && body.action === "relay-record-ai-turn") {
        return jsonResponse({
          run: runSnapshot("run-ai", 3, 1, "ACTIVE", "AI", 1, false),
          replayed: true,
        });
      }
      if (url.endsWith("/result")) {
        return jsonResponse({
          run: runSnapshot("run-ai", 4, 2, "ACTIVE", "AI", 1, true),
          result: null,
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay("ai");
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("재생 상태를 확인하는 학생 질문인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("다른 화면에서 변경되었습니다");
    expect(screen.getByText("2 / 3")).toBeVisible();
    expect(screen.queryByText("과거 재생 질문은 무엇인가요?")).not.toBeInTheDocument();
  });

  it("인공지능 질문 발급 실패 뒤에는 같은 발급 요청 식별값으로 다시 시도한다", async () => {
    let issueAttempts = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-ai", 1, 0, "ACTIVE", "AI") }, 201);
      }
      if (url.endsWith("/actions") && body.action === "relay-submit-question") {
        return jsonResponse({
          run: runSnapshot("run-ai", 2, 1, "ACTIVE", "AI", 0, true),
        });
      }
      if (url.endsWith("/ai-turn")) {
        issueAttempts += 1;
        if (issueAttempts === 1) {
          return jsonResponse({ error: "인공지능 질문 발급 실패" }, 503);
        }
        return jsonResponse({
          output: "다시 발급한 질문은 무엇인가요?",
          proof: "issued-proof",
          expiresAt: "2099-07-16T03:01:30.000Z",
          runVersion: 2,
        });
      }
      if (url.endsWith("/actions") && body.action === "relay-record-ai-turn") {
        return jsonResponse({
          run: runSnapshot("run-ai", 3, 1, "ACTIVE", "AI", 1, false),
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay("ai");
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("발급 재시도에 필요한 질문인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("인공지능 질문 발급 실패");
    expect(screen.queryByText("다시 발급한 질문은 무엇인가요?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "인공지능 차례 다시 시도" }));
    expect((await screen.findAllByText("다시 발급한 질문은 무엇인가요?")).length)
      .toBeGreaterThan(0);

    const issueBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/ai-turn"))
      .map(requestBody);
    expect(issueBodies).toHaveLength(2);
    expect(issueBodies[1].requestId).toBe(issueBodies[0].requestId);
    const recordBody = requestBody(fetchMock.mock.calls.find(([url, actionInit]) =>
      String(url).endsWith("/actions") &&
      requestBody([url, actionInit]).action === "relay-record-ai-turn",
    )!);
    expect(recordBody.generationRequestId).toBe(issueBodies[0].requestId);
    expect(recordBody.requestId).not.toBe(issueBodies[0].requestId);
  });

  it("기기 시각이 발급 만료 시각보다 앞서도 증명을 서버에 기록한다", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2199-01-01T00:00:00.000Z"));
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-ai", 1, 0, "ACTIVE", "AI") }, 201);
      }
      if (url.endsWith("/actions") && body.action === "relay-submit-question") {
        return jsonResponse({
          run: runSnapshot("run-ai", 2, 1, "ACTIVE", "AI", 0, true),
        });
      }
      if (url.endsWith("/ai-turn")) {
        return jsonResponse({
          output: "서버가 판단할 질문은 무엇인가요?",
          proof: "server-validated-proof",
          expiresAt: "2099-07-16T03:01:30.000Z",
          runVersion: 2,
        });
      }
      if (url.endsWith("/actions") && body.action === "relay-record-ai-turn") {
        return jsonResponse({
          run: runSnapshot("run-ai", 3, 1, "ACTIVE", "AI", 1, false),
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay("ai");
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("기기 시각과 무관하게 기록하는 질문인가요?");
    nowSpy.mockRestore();

    expect((await screen.findAllByText("서버가 판단할 질문은 무엇인가요?")).length)
      .toBeGreaterThan(0);
    const recordCalls = fetchMock.mock.calls.filter(([url, actionInit]) =>
      String(url).endsWith("/actions") &&
      requestBody([url, actionInit]).action === "relay-record-ai-turn",
    );
    expect(recordCalls).toHaveLength(1);
    expect(requestBody(recordCalls[0])).toMatchObject({
      output: "서버가 판단할 질문은 무엇인가요?",
      proof: "server-validated-proof",
    });
  });

  it("서버가 증명 만료를 확인하면 같은 발급 식별값으로 새 질문을 받은 뒤 기록한다", async () => {
    let issueAttempts = 0;
    let recordAttempts = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-ai", 1, 0, "ACTIVE", "AI") }, 201);
      }
      if (url.endsWith("/actions") && body.action === "relay-submit-question") {
        return jsonResponse({
          run: runSnapshot("run-ai", 2, 1, "ACTIVE", "AI", 0, true),
        });
      }
      if (url.endsWith("/ai-turn")) {
        issueAttempts += 1;
        return jsonResponse({
          output: issueAttempts === 1
            ? "서버가 만료로 거절할 질문은 무엇인가요?"
            : "새로 발급한 질문은 무엇인가요?",
          proof: issueAttempts === 1 ? "expired-proof" : "fresh-proof",
          expiresAt: "2099-07-16T03:01:30.000Z",
          runVersion: 2,
        });
      }
      if (url.endsWith("/actions") && body.action === "relay-record-ai-turn") {
        recordAttempts += 1;
        if (recordAttempts === 1) {
          return jsonResponse({
            error: "인공지능 질문 증명을 사용할 수 없습니다",
            aiProofRejected: true,
          }, 409);
        }
        return jsonResponse({
          run: runSnapshot("run-ai", 3, 1, "ACTIVE", "AI", 1, false),
        });
      }
      if (url.endsWith("/result")) {
        return jsonResponse({
          run: runSnapshot("run-ai", 2, 1, "ACTIVE", "AI", 0, true),
          result: null,
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay("ai");
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("만료 뒤 새 발급이 필요한 질문인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("증명을 사용할 수 없습니다");
    fireEvent.click(screen.getByRole("button", { name: "인공지능 차례 다시 시도" }));

    expect((await screen.findAllByText("새로 발급한 질문은 무엇인가요?")).length)
      .toBeGreaterThan(0);
    expect(screen.queryByText("서버가 만료로 거절할 질문은 무엇인가요?"))
      .not.toBeInTheDocument();
    const issueBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/ai-turn"))
      .map(requestBody);
    const recordBodies = fetchMock.mock.calls
      .filter(([url, actionInit]) =>
        String(url).endsWith("/actions") &&
        requestBody([url, actionInit]).action === "relay-record-ai-turn",
      )
      .map(requestBody);
    expect(issueBodies).toHaveLength(2);
    expect(issueBodies[1].requestId).toBe(issueBodies[0].requestId);
    expect(recordBodies.map((body) => body.output)).toEqual([
      "서버가 만료로 거절할 질문은 무엇인가요?",
      "새로 발급한 질문은 무엇인가요?",
    ]);
    expect(recordBodies[1].requestId).not.toBe(recordBodies[0].requestId);
    expect(recordBodies[1].generationRequestId).toBe(issueBodies[0].requestId);
  });

  it("증명 거절 뒤 실행 조회가 실패해도 같은 발급 식별값으로 새 질문을 발급한다", async () => {
    let issueAttempts = 0;
    let recordAttempts = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-ai", 1, 0, "ACTIVE", "AI") }, 201);
      }
      if (url.endsWith("/actions") && body.action === "relay-submit-question") {
        return jsonResponse({
          run: runSnapshot("run-ai", 2, 1, "ACTIVE", "AI", 0, true),
        });
      }
      if (url.endsWith("/ai-turn")) {
        issueAttempts += 1;
        return jsonResponse({
          output: issueAttempts === 1
            ? "거절될 인공지능 질문은 무엇인가요?"
            : "다시 발급한 인공지능 질문은 무엇인가요?",
          proof: issueAttempts === 1 ? "rejected-proof" : "renewed-proof",
          expiresAt: "2099-07-16T03:01:30.000Z",
          runVersion: 2,
        });
      }
      if (url.endsWith("/actions") && body.action === "relay-record-ai-turn") {
        recordAttempts += 1;
        if (recordAttempts === 1) {
          return jsonResponse({
            error: "인공지능 질문 증명을 사용할 수 없습니다",
            aiProofRejected: true,
          }, 409);
        }
        return jsonResponse({
          run: runSnapshot("run-ai", 3, 1, "ACTIVE", "AI", 1, false),
        });
      }
      if (url.endsWith("/result")) throw new TypeError("실행 상태 조회 실패");
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay("ai");
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("조회 실패 뒤에도 새 발급이 필요한가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("증명을 사용할 수 없습니다");
    fireEvent.click(screen.getByRole("button", { name: "인공지능 차례 다시 시도" }));

    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/ai-turn"),
    )).toHaveLength(2));
    expect((await screen.findAllByText("다시 발급한 인공지능 질문은 무엇인가요?")).length)
      .toBeGreaterThan(0);
    expect(screen.queryByText("거절될 인공지능 질문은 무엇인가요?"))
      .not.toBeInTheDocument();

    const issueBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/ai-turn"))
      .map(requestBody);
    const recordBodies = fetchMock.mock.calls
      .filter(([url, actionInit]) =>
        String(url).endsWith("/actions") &&
        requestBody([url, actionInit]).action === "relay-record-ai-turn",
      )
      .map(requestBody);
    expect(issueBodies[1].requestId).toBe(issueBodies[0].requestId);
    expect(recordBodies.map((body) => body.output)).toEqual([
      "거절될 인공지능 질문은 무엇인가요?",
      "다시 발급한 인공지능 질문은 무엇인가요?",
    ]);
    expect(recordBodies[1].requestId).not.toBe(recordBodies[0].requestId);
    expect(recordBodies[1].generationRequestId).toBe(issueBodies[0].requestId);
  });

  it("인공지능 발급 만료 시각이 정확한 날짜 형식이 아니면 기록하지 않는다", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/question-games/runs") {
        return jsonResponse({ run: runSnapshot("run-ai", 1, 0, "ACTIVE", "AI") }, 201);
      }
      if (url.endsWith("/actions") && body.action === "relay-submit-question") {
        return jsonResponse({
          run: runSnapshot("run-ai", 2, 1, "ACTIVE", "AI", 0, true),
        });
      }
      if (url.endsWith("/ai-turn")) {
        return jsonResponse({
          output: "만료 시각이 잘못된 질문인가요?",
          proof: "invalid-expiry-proof",
          expiresAt: "tomorrow",
          runVersion: 2,
        });
      }
      if (url.endsWith("/actions") && body.action === "relay-record-ai-turn") {
        return jsonResponse({
          run: runSnapshot("run-ai", 3, 1, "ACTIVE", "AI", 1, false),
        });
      }
      return jsonResponse({ error: "알 수 없는 요청" }, 404);
    });
    renderRelay("ai");
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    await submitQuestion("만료 형식을 확인하는 질문인가요?");

    expect(await screen.findByRole("alert")).toHaveTextContent("발급 결과를 확인할 수 없습니다");
    expect(fetchMock.mock.calls.filter(([url, actionInit]) =>
      String(url).endsWith("/actions") &&
      requestBody([url, actionInit]).action === "relay-record-ai-turn",
    )).toHaveLength(0);
  });

  it("양수 포인트가 일부만 지급되면 일일 상한 적용을 함께 알린다", async () => {
    fetchMock = installSuccessfulServer(3, {
      dailyRemaining: 0,
      cappedByLimit: true,
    });
    vi.stubGlobal("fetch", fetchMock);
    renderRelay();
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);
    await submitQuestion("첫 질문은 무엇인가요?");
    await submitQuestion("둘째 질문은 무엇인가요?");
    await submitQuestion("셋째 질문은 무엇인가요?");

    expect(await screen.findByText("+3점 적립!")).toBeVisible();
    expect(screen.getByText("일일 상한이 적용되었어요.")).toBeVisible();
  });

  it("주제와 질문 입력에 이름을 제공하고 선택한 주제를 상태로 알린다", async () => {
    fetchMock = installSuccessfulServer();
    vi.stubGlobal("fetch", fetchMock);
    renderRelay();

    expect(screen.getByRole("textbox", { name: "직접 주제 입력" }))
      .toHaveAttribute("maxlength", "80");
    const topic = screen.getByRole("button", { name: "우주" });
    expect(topic).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(topic);
    expect(topic).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /질문 릴레이 시작/ }));

    expect(await screen.findByRole("textbox", { name: "이어 갈 질문 입력" }))
      .toHaveAttribute("maxlength", "200");
    expect(screen.getByRole("log", { name: "질문 릴레이 사슬" }))
      .toHaveAttribute("aria-live", "polite");
  });

  it("긴 영문 한 단어 주제를 줄바꿈 가능한 머리말 안에 표시한다", async () => {
    fetchMock = installSuccessfulServer();
    vi.stubGlobal("fetch", fetchMock);
    renderRelay();
    const longTopic = "A".repeat(80);
    fireEvent.change(screen.getByRole("textbox", { name: "직접 주제 입력" }), {
      target: { value: longTopic },
    });
    fireEvent.click(screen.getByRole("button", { name: /질문 릴레이 시작/ }));

    await screen.findByRole("textbox", { name: "이어 갈 질문 입력" });
    const topic = screen.getByText((_content, node) => (
      node?.tagName === "P" && node.textContent === `주제: ${longTopic}`
    ));
    expect(topic).toHaveClass("min-w-0", "break-words", "[overflow-wrap:anywhere]");
    expect(topic.closest("div.min-w-0")).not.toBeNull();
  });

  it("실행 생성과 질문 저장 요청 중에는 목록으로 나갈 수 없다", async () => {
    const pendingCreate = deferred<Response>();
    const pendingAction = deferred<Response>();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/question-games/runs") return pendingCreate.promise;
      if (url.endsWith("/actions")) return pendingAction.promise;
      return Promise.resolve(jsonResponse({ error: "알 수 없는 요청" }, 404));
    });
    renderRelay();
    chooseTopicAndStart();

    const back = screen.getByRole("button", { name: /목록/ });
    expect(back).toBeDisabled();
    await act(async () => {
      pendingCreate.resolve(jsonResponse({ run: runSnapshot("run-1", 1, 0) }, 201));
      await pendingCreate.promise;
    });
    const input = await screen.findByRole("textbox", { name: "이어 갈 질문 입력" });
    fireEvent.change(input, { target: { value: "요청 중에는 나갈 수 없나요?" } });
    fireEvent.click(screen.getByRole("button", { name: /질문 연결/ }));

    expect(screen.getByRole("button", { name: /목록/ })).toBeDisabled();
    await act(async () => {
      pendingAction.resolve(jsonResponse({ run: runSnapshot("run-1", 2, 1) }));
      await pendingAction.promise;
    });
    expect(screen.getByRole("button", { name: /목록/ })).toBeEnabled();
  });

  it("질문 제출 버튼을 빠르게 두 번 눌러도 서버 동작은 한 번만 보낸다", async () => {
    const pendingAction = deferred<Response>();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/question-games/runs") {
        return Promise.resolve(jsonResponse({ run: runSnapshot("run-1", 1, 0) }, 201));
      }
      if (url.endsWith("/actions")) return pendingAction.promise;
      return Promise.resolve(jsonResponse({ error: "알 수 없는 요청" }, 404));
    });
    renderRelay();
    chooseTopicAndStart();
    const input = await screen.findByRole("textbox", { name: "이어 갈 질문 입력" });
    fireEvent.change(input, { target: { value: "빠른 중복 제출은 막히나요?" } });
    const submit = screen.getByRole("button", { name: /질문 연결/ });

    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/actions")))
      .toHaveLength(1);
    await act(async () => {
      pendingAction.resolve(jsonResponse({ run: runSnapshot("run-1", 2, 1) }));
      await pendingAction.promise;
    });
    expect(await screen.findByText("빠른 중복 제출은 막히나요?", { selector: "div" }))
      .toBeVisible();
  });

  it("다시 하기 뒤에는 새 요청 식별값으로 새 실행을 만든다", async () => {
    fetchMock = installSuccessfulServer();
    vi.stubGlobal("fetch", fetchMock);
    renderRelay();
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);
    await submitQuestion("첫 질문은 무엇인가요?");
    await submitQuestion("둘째 질문은 무엇인가요?");
    await submitQuestion("셋째 질문은 무엇인가요?");
    await screen.findByText("릴레이 완성!");

    fireEvent.click(screen.getByRole("button", { name: /다시 하기/ }));
    chooseTopicAndStart();
    await screen.findByPlaceholderText(/첫 번째 질문/);

    const createCalls = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/question-games/runs");
    expect(createCalls).toHaveLength(2);
    expect(requestBody(createCalls[1]).requestId).not.toBe(requestBody(createCalls[0]).requestId);
  });
});
