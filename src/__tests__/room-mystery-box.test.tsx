// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  render as renderWithoutIntl,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import RoomMysteryBox from "@/app/(student)/student-question-play/games/RoomMysteryBox";
import MysteryBoxGame from "@/app/(student)/student-question-play/games/MysteryBoxGame";
import {
  BUILT_IN_GAMES,
  type GameRoom,
  type RoomActionHandler,
  type RoomActionResult,
} from "@/lib/question-games-data";
import {
  createMysteryState,
  readMysteryState,
  toPublicMysteryState,
  type MysteryHistoryItem,
  type MysteryRoomState,
} from "@/lib/question-game-room-engines/mystery";
import en from "../../messages/en.json";

const auth = vi.hoisted(() => ({
  session: {
    data: { user: { id: "host", name: "학생", role: "STUDENT" } },
    status: "authenticated",
  },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => auth.session,
}));

const game = BUILT_IN_GAMES.find(({ id }) => id === "mystery-box")!;
const players: GameRoom["players"] = [
  { id: "host", name: "방장", isHost: true, joinedAt: 1 },
  { id: "other", name: "학생", isHost: false, joinedAt: 2 },
];
const ROUND_ID = "10000000-0000-4000-8000-000000000001";
const COMMAND_ID = "20000000-0000-4000-8000-000000000001";

function renderEnglish(ui: ReactElement) {
  return renderWithoutIntl(
    <NextIntlClientProvider
      locale="en"
      messages={en as never}
      timeZone="Asia/Seoul"
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  auth.session = {
    data: { user: { id: "host", name: "학생", role: "STUDENT" } },
    status: "authenticated",
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function makeRoom(
  state: Record<string, unknown>,
  overrides: Partial<GameRoom> = {},
): GameRoom {
  return {
    code: "1234",
    gameId: "mystery-box",
    hostId: "host",
    status: "playing",
    players,
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: state,
    version: 7,
    createdAt: 10,
    updatedAt: 10,
    playId: "play-1",
    ...overrides,
  };
}

function question(
  playerId: "host" | "other",
  playerName: "방장" | "학생",
  value = "먹을 수 있나요?",
): MysteryHistoryItem {
  return {
    kind: "question",
    playerId,
    playerName,
    locale: "ko",
    question: value,
    answer: "yes",
  };
}

function wrongGuess(
  playerId: "host" | "other",
  playerName: "방장" | "학생",
  guess = "책",
): MysteryHistoryItem {
  return {
    kind: "guess",
    playerId,
    playerName,
    locale: "ko",
    guess,
    correct: false,
  };
}

function storedPlayState(
  history: MysteryHistoryItem[] = [],
  overrides: Partial<MysteryRoomState> = {},
): MysteryRoomState {
  const scores = { host: 0, other: 0 };
  for (const item of history) {
    if (item.kind === "question") scores[item.playerId as "host" | "other"] += 1;
  }
  const state: MysteryRoomState = {
    ...createMysteryState(),
    phase: "play",
    roundId: ROUND_ID,
    round: history.length + 1,
    turnOrder: ["host", "other"],
    currentTurnIdx: history.length % 2,
    history,
    scores,
    private: { itemId: "apple" },
    ...overrides,
  };
  expect(readMysteryState(state)).not.toBeNull();
  return state;
}

function publicState(state: MysteryRoomState): Record<string, unknown> {
  const projected = toPublicMysteryState(state);
  expect(projected).not.toHaveProperty("private");
  return projected;
}

function completedWithWinner(): MysteryRoomState {
  const state: MysteryRoomState = {
    ...storedPlayState(),
    phase: "done",
    endReason: "completed",
    round: 1,
    history: [{
      kind: "guess",
      playerId: "host",
      playerName: "방장",
      locale: "ko",
      guess: "사과",
      correct: true,
    }],
    winnerId: "host",
    answer: { ko: "사과", en: "apple" },
  };
  expect(readMysteryState(state)).not.toBeNull();
  return state;
}

function completedAtLimit(): MysteryRoomState {
  const history = Array.from({ length: 20 }, (_, index) =>
    question(index % 2 === 0 ? "host" : "other", index % 2 === 0 ? "방장" : "학생"));
  const state: MysteryRoomState = {
    ...storedPlayState(history.slice(0, 19)),
    phase: "done",
    endReason: "completed",
    round: 20,
    currentTurnIdx: 0,
    history,
    scores: { host: 10, other: 10 },
    answer: { ko: "사과", en: "apple" },
  };
  expect(readMysteryState(state)).not.toBeNull();
  return state;
}

function success(room: GameRoom): RoomActionResult {
  return { ok: true, room };
}

function failure(
  room: GameRoom,
  reason: "conflict" | "network" | "rejected" | "superseded" = "conflict",
): RoomActionResult {
  return {
    ok: false,
    room,
    status: reason === "conflict" ? 409 : reason === "rejected" ? 400 : null,
    reason,
  };
}

function makeProps(
  room: GameRoom,
  onAction: RoomActionHandler = vi.fn<RoomActionHandler>(),
  myId = "host",
  actionLoading = false,
) {
  return {
    game,
    room,
    myId,
    actionLoading,
    onAction,
    onLeave: vi.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function stubCommandId(value = COMMAND_ID) {
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => value) });
}

function stubCommandIds(...values: string[]) {
  let index = 0;
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => values[index++] ?? values.at(-1) ?? COMMAND_ID),
  });
}

describe("미스터리 박스 친구 방 공개 상태", () => {
  it("방장만 준비 상태에서 수동 시작하고 실행 식별값만 보낸다", async () => {
    stubCommandId();
    const room = makeRoom(createMysteryState() as unknown as Record<string, unknown>);
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(success(room));

    render(<RoomMysteryBox {...makeProps(room, onAction)} />);
    fireEvent.click(screen.getByRole("button", { name: "미스터리 상자 시작" }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenCalledWith(
      "mystery-start",
      { playId: "play-1" },
      {
        commandId: COMMAND_ID,
        expectedRoom: { code: "1234", createdAt: 10 },
      },
    );
    expect(onAction.mock.calls[0]?.[1]).not.toHaveProperty("itemId");
  });

  it("비방장과 손상된 공개 상태에서는 시작하거나 놀이 명령을 보내지 않는다", () => {
    const setupRoom = makeRoom(createMysteryState() as unknown as Record<string, unknown>);
    const onAction = vi.fn<RoomActionHandler>();
    const first = render(
      <RoomMysteryBox {...makeProps(setupRoom, onAction, "other")} />,
    );

    expect(screen.queryByRole("button", { name: "미스터리 상자 시작" })).not.toBeInTheDocument();
    expect(screen.getByText(/방장이 놀이를 시작할 때까지/)).toBeVisible();
    first.unmount();

    const stored = storedPlayState();
    render(
      <RoomMysteryBox
        {...makeProps(makeRoom(stored as unknown as Record<string, unknown>), onAction)}
      />,
    );
    expect(screen.getByText(/안전하게 불러오지 못했어요/)).toBeVisible();
    expect(screen.queryByText("사과")).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("두 참가자가 같은 기록과 판정 및 다음 차례와 남은 활동을 본다", () => {
    const history = [question("host", "방장"), wrongGuess("other", "학생")];
    const room = makeRoom(publicState(storedPlayState(history)));

    const first = render(<RoomMysteryBox {...makeProps(room, vi.fn(), "host")} />);
    expect(screen.getByText("먹을 수 있나요?")).toBeVisible();
    expect(screen.getByText("예")).toBeVisible();
    expect(screen.getByText("책")).toBeVisible();
    expect(screen.getByText("틀렸어요")).toBeVisible();
    expect(screen.getByText(/현재 차례.*방장/)).toBeVisible();
    expect(screen.getByText("남은 활동 18")).toBeVisible();
    expect(screen.queryByText("사과")).not.toBeInTheDocument();
    first.unmount();

    render(<RoomMysteryBox {...makeProps(room, vi.fn(), "other")} />);
    expect(screen.getByText("먹을 수 있나요?")).toBeVisible();
    expect(screen.getByText("예")).toBeVisible();
    expect(screen.getByText(/현재 차례.*방장/)).toBeVisible();
    expect(screen.getByText("남은 활동 18")).toBeVisible();
  });

  it("인공지능을 사용할 수 없었던 질문은 입력 가까이에서 임시 답변임을 알린다", () => {
    const fallbackQuestion = {
      kind: "question",
      playerId: "host",
      playerName: "방장",
      locale: "ko",
      question: "무슨 소리가 나나요?",
      answer: "unknown",
      answerSource: "fallback",
    } as unknown as MysteryHistoryItem;
    const rawState = storedPlayState();
    const { private: _private, ...publicRawState } = rawState;
    const room = makeRoom({
      ...publicRawState,
      round: 2,
      currentTurnIdx: 1,
      history: [fallbackQuestion],
      scores: { host: 1, other: 0 },
    });

    render(<RoomMysteryBox {...makeProps(room, vi.fn(), "other")} />);

    expect(screen.getByText("무슨 소리가 나나요?")).toBeVisible();
    expect(screen.getAllByText(/인공지능 답변을 연결하지 못해/).length).toBeGreaterThan(0);
    expect(screen.getByText(/질문 활동은 정상적으로 저장됐어요/)).toBeVisible();
  });

  it("내 차례 질문과 추측을 서로 다른 서버 명령으로만 보낸다", async () => {
    stubCommandId();
    const room = makeRoom(publicState(storedPlayState()));
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(success(room));
    const view = render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    fireEvent.change(screen.getByLabelText("예 또는 아니오 질문"), {
      target: { value: "먹을 수 있나요?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenLastCalledWith(
      "mystery-ask",
      {
        playId: "play-1",
        roundId: ROUND_ID,
        locale: "ko",
        question: "먹을 수 있나요?",
      },
      {
        commandId: COMMAND_ID,
        expectedRoom: { code: "1234", createdAt: 10 },
      },
    );

    view.rerender(<RoomMysteryBox {...makeProps(room, onAction)} />);
    fireEvent.change(screen.getByLabelText("정답 추측"), {
      target: { value: "사과" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추측 보내기" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(onAction).toHaveBeenLastCalledWith(
      "mystery-guess",
      {
        playId: "play-1",
        roundId: ROUND_ID,
        locale: "ko",
        guess: "사과",
      },
      {
        commandId: COMMAND_ID,
        expectedRoom: { code: "1234", createdAt: 10 },
      },
    );
    for (const call of onAction.mock.calls) {
      expect(call[1]).not.toHaveProperty("private");
      expect(call[1]).not.toHaveProperty("itemId");
      expect(call[1]).not.toHaveProperty("gameState");
      expect(call[1]).not.toHaveProperty("scores");
      expect(call[1]).not.toHaveProperty("turnOrder");
    }
  });

  it("차례 밖이거나 실행 및 라운드 식별값이 없거나 요청 중이면 입력을 잠근다", () => {
    const state = publicState(storedPlayState([question("host", "방장")]));
    const room = makeRoom(state);
    const first = render(<RoomMysteryBox {...makeProps(room, vi.fn(), "host")} />);
    expect(screen.getByLabelText("예 또는 아니오 질문")).toBeDisabled();
    expect(screen.getByLabelText("정답 추측")).toBeDisabled();
    first.unmount();

    const noPlayId = makeRoom(state, { playId: undefined });
    const second = render(<RoomMysteryBox {...makeProps(noPlayId)} />);
    expect(screen.getByLabelText("예 또는 아니오 질문")).toBeDisabled();
    second.unmount();

    render(<RoomMysteryBox {...makeProps(room, vi.fn(), "other", true)} />);
    expect(screen.getByLabelText("예 또는 아니오 질문")).toBeDisabled();
    expect(screen.getByLabelText("정답 추측")).toBeDisabled();
  });

  it("같은 그리기 차례의 연속 누르기를 즉시 한 번으로 막는다", async () => {
    stubCommandId();
    const pending = deferred<RoomActionResult>();
    const room = makeRoom(publicState(storedPlayState()));
    const onAction = vi.fn<RoomActionHandler>().mockReturnValue(pending.promise);
    render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    fireEvent.change(screen.getByLabelText("예 또는 아니오 질문"), {
      target: { value: "먹을 수 있나요?" },
    });
    const submit = screen.getByRole("button", { name: "질문 보내기" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onAction).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(success(room)); });
  });

  it("연결 실패 뒤 입력과 같은 명령 식별값을 보존하고 성공한 뒤에만 지운다", async () => {
    stubCommandId();
    const room = makeRoom(publicState(storedPlayState()));
    const onAction = vi.fn<RoomActionHandler>()
      .mockResolvedValueOnce(failure(room, "network"))
      .mockResolvedValueOnce(success(room));
    render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    const input = screen.getByLabelText("예 또는 아니오 질문");
    fireEvent.change(input, { target: { value: "먹을 수 있나요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("먹을 수 있나요?");

    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(onAction.mock.calls[0]?.[2]?.commandId).toBe(COMMAND_ID);
    expect(onAction.mock.calls[1]?.[2]?.commandId).toBe(COMMAND_ID);
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it.each([
    {
      label: "예 또는 아니오 질문",
      button: "질문 보내기",
      value: "  먹을 수 있나요?  ",
      field: "question",
      sent: "먹을 수 있나요?",
    },
    {
      label: "정답 추측",
      button: "추측 보내기",
      value: "  사과  ",
      field: "guess",
      sent: "사과",
    },
  ])("앞뒤 공백을 뺀 $field 요청이 성공하면 원래 입력을 지운다", async ({
    label,
    button,
    value,
    field,
    sent,
  }) => {
    stubCommandId();
    const room = makeRoom(publicState(storedPlayState()));
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(success(room));
    render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: button }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      [field]: sent,
    }));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("질문과 추측의 연결 실패 재시도 식별값을 서로 덮어쓰지 않는다", async () => {
    const questionCommandId = "20000000-0000-4000-8000-000000000011";
    const guessCommandId = "20000000-0000-4000-8000-000000000012";
    stubCommandIds(questionCommandId, guessCommandId);
    const room = makeRoom(publicState(storedPlayState()));
    const onAction = vi.fn<RoomActionHandler>()
      .mockResolvedValueOnce(failure(room, "network"))
      .mockResolvedValueOnce(failure(room, "network"))
      .mockResolvedValueOnce(success(room));
    render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    fireEvent.change(screen.getByLabelText("예 또는 아니오 질문"), {
      target: { value: "먹을 수 있나요?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("정답 추측"), {
      target: { value: "사과" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추측 보내기" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(3));
    expect(onAction.mock.calls[0]?.[2]?.commandId).toBe(questionCommandId);
    expect(onAction.mock.calls[1]?.[2]?.commandId).toBe(guessCommandId);
    expect(onAction.mock.calls[2]?.[2]?.commandId).toBe(questionCommandId);
  });

  it.each(["conflict", "rejected", "superseded"] as const)(
    "%s 응답에서는 학생 입력을 보존한다",
    async (reason) => {
      stubCommandId();
      const room = makeRoom(publicState(storedPlayState()));
      const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(failure(room, reason));
      render(<RoomMysteryBox {...makeProps(room, onAction)} />);

      const input = screen.getByLabelText("정답 추측");
      fireEvent.change(input, { target: { value: "사과" } });
      fireEvent.click(screen.getByRole("button", { name: "추측 보내기" }));

      await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
      expect(input).toHaveValue("사과");
    },
  );

  it("응답을 잃은 명령이 최근 명령 목록에 나타나면 입력을 지운다", async () => {
    stubCommandId();
    const stored = storedPlayState();
    const room = makeRoom(publicState(stored));
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(failure(room, "network"));
    const view = render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    const input = screen.getByLabelText("예 또는 아니오 질문");
    fireEvent.change(input, { target: { value: "먹을 수 있나요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("먹을 수 있나요?");

    const confirmed = { ...stored, recentCommandIds: [COMMAND_ID] };
    view.rerender(
      <RoomMysteryBox
        {...makeProps(makeRoom(publicState(confirmed), { version: 8 }), onAction)}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText("예 또는 아니오 질문")).toHaveValue(""));
  });

  it.each([
    {
      label: "예 또는 아니오 질문",
      button: "질문 보내기",
      value: "  먹을 수 있나요?  ",
    },
    {
      label: "정답 추측",
      button: "추측 보내기",
      value: "  사과  ",
    },
  ])("응답을 잃은 앞뒤 공백 입력도 최근 명령 확인 뒤 지운다: $label", async ({
    label,
    button,
    value,
  }) => {
    stubCommandId();
    const stored = storedPlayState();
    const room = makeRoom(publicState(stored));
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(failure(room, "network"));
    const view = render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: button }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue(value);

    const confirmed = { ...stored, recentCommandIds: [COMMAND_ID] };
    view.rerender(
      <RoomMysteryBox
        {...makeProps(makeRoom(publicState(confirmed), { version: 8 }), onAction)}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText(label)).toHaveValue(""));
  });

  it.each([
    {
      label: "예 또는 아니오 질문",
      button: "질문 보내기",
      original: "  먹을 수 있나요?  ",
      changed: "다른 질문인가요?",
    },
    {
      label: "정답 추측",
      button: "추측 보내기",
      original: "  사과  ",
      changed: "자동차",
    },
  ])("최근 명령을 확인해도 학생이 실제 내용을 바꾼 입력은 지우지 않는다: $label", async ({
    label,
    button,
    original,
    changed,
  }) => {
    stubCommandId();
    const stored = storedPlayState();
    const room = makeRoom(publicState(stored));
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(failure(room, "network"));
    const view = render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value: original } });
    fireEvent.click(screen.getByRole("button", { name: button }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: changed } });

    const confirmed = { ...stored, recentCommandIds: [COMMAND_ID] };
    view.rerender(
      <RoomMysteryBox
        {...makeProps(makeRoom(publicState(confirmed), { version: 8 }), onAction)}
      />,
    );
    expect(screen.getByLabelText(label)).toHaveValue(changed);
  });

  it("이전 방 수명의 늦은 성공은 새 방에 쓴 입력을 지우지 않는다", async () => {
    stubCommandId();
    const pending = deferred<RoomActionResult>();
    const oldRoom = makeRoom(publicState(storedPlayState()));
    const onAction = vi.fn<RoomActionHandler>().mockReturnValue(pending.promise);
    const view = render(<RoomMysteryBox {...makeProps(oldRoom, onAction)} />);

    fireEvent.change(screen.getByLabelText("예 또는 아니오 질문"), {
      target: { value: "먹을 수 있나요?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 보내기" }));
    expect(onAction).toHaveBeenCalledTimes(1);

    const newRoom = makeRoom(publicState(storedPlayState()), {
      createdAt: 20,
      version: 1,
      updatedAt: 20,
      playId: "play-2",
    });
    view.rerender(<RoomMysteryBox {...makeProps(newRoom, onAction)} />);
    await waitFor(() => expect(screen.getByLabelText("예 또는 아니오 질문")).toHaveValue(""));
    fireEvent.change(screen.getByLabelText("예 또는 아니오 질문"), {
      target: { value: "새 방 질문인가요?" },
    });

    await act(async () => { pending.resolve(success(oldRoom)); });
    expect(screen.getByLabelText("예 또는 아니오 질문")).toHaveValue("새 방 질문인가요?");
  });
});

describe("미스터리 박스 친구 방 결과", () => {
  it("정답 성공 뒤 승자와 공개 정답 및 질문 수를 보여 주고 포인트를 요청하지 않는다", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const room = makeRoom(publicState(completedWithWinner()), {
      status: "ended",
    });
    const onAction = vi.fn<RoomActionHandler>();

    render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    expect(screen.getByText("정답을 맞혔어요")).toBeVisible();
    expect(screen.getByText(/방장.*정답/)).toBeVisible();
    expect(screen.getByText("공개 정답")).toBeVisible();
    expect(screen.getAllByText("사과")).toHaveLength(2);
    expect(screen.getAllByText("0개 질문")).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("스무 활동 실패와 참가자 부족 종료를 구분한다", () => {
    const limitRoom = makeRoom(publicState(completedAtLimit()), { status: "ended" });
    const first = render(<RoomMysteryBox {...makeProps(limitRoom)} />);
    expect(screen.getByText("스무 활동을 모두 사용했어요")).toBeVisible();
    expect(screen.getByText("사과")).toBeVisible();
    first.unmount();

    const beforeStart: MysteryRoomState = {
      ...createMysteryState(),
      phase: "done",
      endReason: "insufficient-players",
    };
    const beforeRoom = makeRoom(publicState(beforeStart), { status: "ended" });
    const second = render(<RoomMysteryBox {...makeProps(beforeRoom)} />);
    expect(screen.getByText(/시작 전에 참가자가 부족해/)).toBeVisible();
    expect(screen.queryByText("공개 정답")).not.toBeInTheDocument();
    second.unmount();

    const midState: MysteryRoomState = {
      ...storedPlayState([question("host", "방장")]),
      phase: "done",
      endReason: "insufficient-players",
      answer: { ko: "사과", en: "apple" },
    };
    const midRoom = makeRoom(publicState(midState), { status: "ended" });
    render(<RoomMysteryBox {...makeProps(midRoom)} />);
    expect(screen.getByText(/진행 중 참가자가 부족해/)).toBeVisible();
    expect(screen.getByText("사과")).toBeVisible();
  });

  it("교사 방장의 완료 결과는 질문만 점수 근거로 받고 추측을 상세 기록에 보존한다", async () => {
    auth.session = {
      data: { user: { id: "host", name: "방장", role: "TEACHER" } },
      status: "authenticated",
    };
    const history = [
      question("other", "학생", "둥근 모양인가요?"),
      {
        kind: "guess" as const,
        playerId: "host",
        playerName: "방장",
        locale: "ko" as const,
        guess: "사과",
        correct: true,
      },
    ];
    const completed: MysteryRoomState = {
      ...storedPlayState([history[0]]),
      phase: "done",
      endReason: "completed",
      round: 2,
      currentTurnIdx: 0,
      history,
      scores: { host: 0, other: 1 },
      winnerId: "host",
      answer: { ko: "사과", en: "apple" },
    };
    expect(readMysteryState(completed)).not.toBeNull();
    const playId = "30000000-0000-4000-8000-000000000001";
    const room = makeRoom(publicState(completed), {
      status: "ended",
      playId,
      pointAwardKeyVersion: 2,
      pointEvidenceVersion: 2,
    });
    const award = {
      awards: [{
        studentId: "other",
        bonusType: "VALID_QUESTIONS",
        points: 3,
        reason: "좋은 질문",
      }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify(award),
      { status: 200, headers: { "content-type": "application/json" } },
    )));
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(
      success({ ...room, awardResult: award }),
    );

    render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(JSON.parse(String(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body,
    ))).toEqual({
      gameId: "mystery-box",
      roomCode: "1234",
      roomCreatedAt: 10,
      playId,
    });
    await waitFor(() => expect(onAction).toHaveBeenCalledWith(
      "publish-award-result",
      { playId },
      { expectedRoom: { code: "1234", createdAt: 10, playId } },
    ));
    expect(screen.getByText("둥근 모양인가요?")).toBeVisible();
    expect(screen.getAllByText("사과")).toHaveLength(2);
    expect(screen.getByText("공개 정답")).toBeVisible();
    expect(screen.getByText("1개 질문")).toBeVisible();
  });

  it("방장만 결과에서 일반 다시 시작 명령을 한 번 보낸다", async () => {
    stubCommandId();
    const room = makeRoom(publicState(completedWithWinner()), { status: "ended" });
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(success(room));
    const view = render(<RoomMysteryBox {...makeProps(room, onAction)} />);

    fireEvent.click(screen.getByRole("button", { name: "다시 시작" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenCalledWith(
      "restart",
      {},
      {
        commandId: COMMAND_ID,
        expectedRoom: { code: "1234", createdAt: 10 },
      },
    );
    view.unmount();

    render(<RoomMysteryBox {...makeProps(room, vi.fn(), "other")} />);
    expect(screen.queryByRole("button", { name: "다시 시작" })).not.toBeInTheDocument();
    expect(screen.getByText(/방장이 다시 시작할 때까지/)).toBeVisible();
  });

  it("결과 다시 시작 요청 중에는 나가기를 잠그고 실패 뒤 다시 연다", async () => {
    stubCommandId();
    const pending = deferred<RoomActionResult>();
    const room = makeRoom(publicState(completedWithWinner()), { status: "ended" });
    const onAction = vi.fn<RoomActionHandler>().mockReturnValue(pending.promise);
    const onLeave = vi.fn();
    render(
      <RoomMysteryBox
        {...makeProps(room, onAction)}
        onLeave={onLeave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 시작" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));

    const leave = screen.getByRole("button", { name: /나가기/ });
    expect(leave).toBeDisabled();
    fireEvent.click(leave);
    expect(onLeave).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(failure(room));
      await pending.promise;
    });
    await waitFor(() => expect(leave).toBeEnabled());
  });

  it("화면과 놀이 지도는 공개 판독기와 허용된 명령 및 전용 방 화면만 쓴다", () => {
    const roomSource = readFileSync(
      join(process.cwd(), "src/app/(student)/student-question-play/games/RoomMysteryBox.tsx"),
      "utf8",
    );
    const pageSource = readFileSync(
      join(process.cwd(), "src/app/(student)/student-question-play/[gameId]/page.tsx"),
      "utf8",
    );
    const flowSource = readFileSync(
      join(process.cwd(), "src/components/question-games/QuestionGameRoomFlow.tsx"),
      "utf8",
    );

    expect(roomSource).toContain("readMysteryPublicState");
    expect(roomSource).not.toMatch(/readMysteryState\s*\(/);
    expect(roomSource).not.toMatch(/\.private\b|\bitemId\b/);
    expect(new Set(
      Array.from(roomSource.matchAll(/\"(mystery-[a-z-]+|restart)\"/g), (match) => match[1]),
    )).toEqual(new Set(["mystery-start", "mystery-ask", "mystery-guess", "restart"]));
    expect(roomSource).not.toContain("update-state");
    expect(roomSource).toContain("RoomResult");
    expect(pageSource).toContain("QuestionGameRoomFlow");
    expect(flowSource).toContain("RoomMysteryBox");
    expect(flowSource).toMatch(/\"mystery-box\"\s*:\s*RoomMysteryBox/);
    expect(pageSource).not.toContain('config={{ mode: "friend"');
  });
});

type LocalMysteryMode = "solo" | "ai";
type LocalMysteryActor = "STUDENT" | "AI";
type LocalMysteryHistoryItem =
  | {
      sequence: number;
      actor: LocalMysteryActor;
      kind: "QUESTION";
      text: string;
      answer: "yes" | "no";
    }
  | {
      sequence: number;
      actor: LocalMysteryActor;
      kind: "GUESS";
      text: string;
      correct: boolean;
    };

interface LocalMysteryServerOptions {
  loseQuestionRequestOnce?: boolean;
  failAiOnce?: "network" | "503";
  loseFinalResponse?: boolean;
  closeQuestionRequestOnce?: "EXPIRED" | "ABANDONED";
  closeAiRequestOnce?: "EXPIRED" | "ABANDONED";
  settledAnswerItemId?: string;
  forceFirstMatchingGuessFalse?: boolean;
}

function installLocalMysteryServer(
  mode: LocalMysteryMode,
  options: LocalMysteryServerOptions = {},
) {
  const runId = `mystery-${mode}`;
  const history: LocalMysteryHistoryItem[] = [];
  const responses = new Map<
    string,
    { fingerprint: string; response: Record<string, unknown> }
  >();
  let status: "ACTIVE" | "SETTLED" | "EXPIRED" | "ABANDONED" = "ACTIVE";
  let nextStep: "STUDENT_ACTION" | "AI_TURN" | "COMPLETE" = "STUDENT_ACTION";
  let studentQuestionCount = 0;
  let winner: LocalMysteryActor | null = null;
  let endReason: "SOLVED" | "LIMIT" | null = null;
  let result: Record<string, unknown> | null = null;
  let questionNetworkFailed = false;
  let aiFailed = false;
  let finalResponseLost = false;
  let matchingGuessForcedFalse = false;

  const snapshot = () => ({
    id: runId,
    gameId: "mystery-box",
    mode: mode.toUpperCase(),
    status,
    version: history.length +
      (status === "EXPIRED" || status === "ABANDONED" ? 2 : 1),
    targetCount: 20,
    questionCount: history.length,
    aiTurnCount: history.filter(({ actor }) => actor === "AI").length,
    awaitingAiTurn: nextStep === "AI_TURN",
    preview: false,
    mysteryLocale: "ko",
    mysteryNextStep: nextStep,
    mysteryActivityCount: history.length,
    mysteryStudentQuestionCount: studentQuestionCount,
    mysteryHistory: structuredClone(history),
    mysteryWinner: winner,
    mysteryEndReason: endReason,
    mysteryAnswerItemId: status === "SETTLED"
      ? options.settledAnswerItemId ?? "apple"
      : null,
  });

  const settle = (solvedBy: LocalMysteryActor | null) => {
    status = "SETTLED";
    nextStep = "COMPLETE";
    winner = solvedBy;
    endReason = solvedBy ? "SOLVED" : "LIMIT";
    const requested = mode === "ai"
      ? studentQuestionCount * 2 + 3
      : studentQuestionCount + 2;
    const dailyLimit = mode === "ai" ? 50 : 30;
    result = {
      awarded: requested,
      dailyLimit,
      dailyRemaining: dailyLimit - requested,
      cappedByLimit: false,
      preview: false,
    };
  };

  const appendActivity = (activity: LocalMysteryHistoryItem) => {
    history.push(activity);
    if (activity.actor === "STUDENT" && activity.kind === "QUESTION") {
      studentQuestionCount += 1;
    }
    if (activity.kind === "GUESS" && activity.correct) {
      settle(activity.actor);
    } else if (history.length === 20) {
      settle(null);
    } else {
      nextStep = mode === "ai" && activity.actor === "STUDENT"
        ? "AI_TURN"
        : "STUDENT_ACTION";
    }
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (url === "/api/question-games/runs") {
      return Response.json({ run: snapshot(), replayed: false }, { status: 201 });
    }
    if (url.endsWith("/result")) {
      return Response.json({
        run: snapshot(),
        result: result ? { ...result, alreadySettled: true } : null,
      });
    }
    if (!url.endsWith("/actions")) {
      return Response.json({ error: "지원하지 않는 시험 요청입니다" }, { status: 404 });
    }

    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const fingerprint = JSON.stringify({
      action: body.action,
      locale: body.locale,
      question: body.question,
      guess: body.guess,
    });
    const replay = responses.get(requestId);
    if (replay) {
      if (replay.fingerprint !== fingerprint) {
        return Response.json(
          { error: "같은 요청 식별값에 다른 동작이 들어왔습니다" },
          { status: 409 },
        );
      }
      return Response.json({ ...replay.response, replayed: true });
    }
    if (status !== "ACTIVE" || body.expectedVersion !== history.length + 1) {
      return Response.json(
        { error: "질문놀이 실행 상태가 바뀌었습니다" },
        { status: 409 },
      );
    }

    if (body.action === "mystery-submit-question") {
      if (nextStep !== "STUDENT_ACTION") {
        return Response.json(
          { error: "인공지능 차례를 먼저 마쳐 주세요" },
          { status: 409 },
        );
      }
      if (body.question === "무슨 소리가 나나요?") {
        return Response.json(
          { error: "한 가지 특징을 묻는 질문으로 다시 써 주세요" },
          { status: 422 },
        );
      }
      if (body.question === "답변 서버가 확인할 수 있나요?") {
        return Response.json(
          { error: "질문 답변을 확인하지 못했습니다. 다시 시도해 주세요" },
          { status: 503 },
        );
      }
      if (options.closeQuestionRequestOnce && !questionNetworkFailed) {
        questionNetworkFailed = true;
        status = options.closeQuestionRequestOnce;
        throw new TypeError("질문 요청 중 실행이 닫혔습니다");
      }
      if (options.loseQuestionRequestOnce && !questionNetworkFailed) {
        questionNetworkFailed = true;
        throw new TypeError("질문 요청 연결이 끊겼습니다");
      }
      const text = String(body.question).trim();
      appendActivity({
        sequence: history.length + 1,
        actor: "STUDENT",
        kind: "QUESTION",
        text,
        answer: text.includes("날 수") ? "no" : "yes",
      });
    } else if (body.action === "mystery-submit-guess") {
      if (nextStep !== "STUDENT_ACTION") {
        return Response.json(
          { error: "인공지능 차례를 먼저 마쳐 주세요" },
          { status: 409 },
        );
      }
      const text = String(body.guess).trim();
      const normalized = text.normalize("NFKC").toLocaleLowerCase();
      const matchesAnswer = ["사과", "풋사과", "apple", "green apple"].includes(normalized);
      const forceFalse = Boolean(
        matchesAnswer &&
        options.forceFirstMatchingGuessFalse &&
        !matchingGuessForcedFalse,
      );
      if (forceFalse) matchingGuessForcedFalse = true;
      const correct = matchesAnswer && !forceFalse;
      appendActivity({
        sequence: history.length + 1,
        actor: "STUDENT",
        kind: "GUESS",
        text,
        correct,
      });
    } else if (body.action === "mystery-ai-turn") {
      if (mode !== "ai" || nextStep !== "AI_TURN") {
        return Response.json(
          { error: "지금은 인공지능 차례가 아닙니다" },
          { status: 409 },
        );
      }
      if (options.closeAiRequestOnce && !aiFailed) {
        aiFailed = true;
        status = options.closeAiRequestOnce;
        throw new TypeError("인공지능 차례 중 실행이 닫혔습니다");
      }
      if (!aiFailed && options.failAiOnce) {
        aiFailed = true;
        if (options.failAiOnce === "503") {
          return Response.json(
            { error: "인공지능 차례를 진행하지 못했습니다" },
            { status: 503 },
          );
        }
        throw new TypeError("인공지능 차례 연결이 끊겼습니다");
      }
      appendActivity({
        sequence: history.length + 1,
        actor: "AI",
        kind: "QUESTION",
        text: "작은가요?",
        answer: "yes",
      });
    } else {
      return Response.json({ error: "지원하지 않는 미스터리 동작입니다" }, { status: 400 });
    }

    const response = { run: snapshot(), result, replayed: false };
    responses.set(requestId, { fingerprint, response: structuredClone(response) });
    if (
      options.loseFinalResponse &&
      snapshot().status === "SETTLED" &&
      !finalResponseLost
    ) {
      finalResponseLost = true;
      throw new TypeError("마지막 미스터리 응답 연결이 끊겼습니다");
    }
    return Response.json(response);
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, snapshot };
}

async function flushLocalMystery() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function startLocalMystery(
  mode: LocalMysteryMode = "solo",
  options: LocalMysteryServerOptions = {},
) {
  const server = installLocalMysteryServer(mode, options);
  render(
    <MysteryBoxGame
      game={game}
      onBack={vi.fn()}
      config={{ mode, players: mode === "ai" ? ["나", "AI"] : ["나"] }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /시작/ }));
  await flushLocalMystery();
  await screen.findByLabelText("예 또는 아니오 질문하기");
  return server;
}

async function submitLocalMysteryQuestion(value: string) {
  const input = screen.getByLabelText("예 또는 아니오 질문하기");
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));
  await flushLocalMystery();
}

async function submitLocalMysteryGuess(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "정답 추측" }));
  const input = screen.getByLabelText("상자 속 물건은 무엇인가요?");
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "정답 제출" }));
  await flushLocalMystery();
}

function expectLocalMysteryRemaining(value: number) {
  expect(screen.getByText(`${value}회 남음`)).toBeVisible();
}

describe("지역 미스터리 박스 서버 실행", () => {
  it("진행 중 정답을 숨기고 질문과 추측을 서버 공개 기록으로만 그린다", async () => {
    const { fetchMock, snapshot } = await startLocalMystery();
    expect(JSON.stringify(snapshot())).not.toContain("apple");
    expect(JSON.stringify(snapshot())).not.toContain("사과");
    expect(screen.queryByText("사과")).not.toBeInTheDocument();

    await submitLocalMysteryQuestion("먹을 수 있나요?");
    expect(screen.getByText("예")).toBeVisible();
    expectLocalMysteryRemaining(19);
    await submitLocalMysteryGuess("책");
    expect(screen.getByText("정답이 아님")).toBeVisible();
    expectLocalMysteryRemaining(18);

    const actionBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/actions"))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(actionBodies).toEqual([
      expect.objectContaining({
        action: "mystery-submit-question",
        expectedVersion: 1,
        locale: "ko",
        question: "먹을 수 있나요?",
      }),
      expect.objectContaining({
        action: "mystery-submit-guess",
        expectedVersion: 2,
        locale: "ko",
        guess: "책",
      }),
    ]);
    expect(actionBodies.every((body) => !(
      "itemId" in body || "answerItemId" in body || "history" in body
    ))).toBe(true);
  });

  it.each([
    ["무슨 소리가 나나요?", "한 가지 특징을 묻는 질문으로 다시 써 주세요"],
    ["답변 서버가 확인할 수 있나요?", "질문 답변을 확인하지 못했습니다. 다시 시도해 주세요"],
  ])("서버가 %s 질문을 거절하면 입력과 활동을 그대로 둔다", async (question, message) => {
    const { snapshot } = await startLocalMystery();
    await submitLocalMysteryQuestion(question);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("예 또는 아니오 질문하기")).toHaveValue(question);
    expectLocalMysteryRemaining(20);
    expect(snapshot()).toMatchObject({
      version: 1,
      questionCount: 0,
      mysteryActivityCount: 0,
      mysteryHistory: [],
    });
  });

  it("질문 연결 실패 뒤 입력과 요청 식별값을 보존해 한 번만 기록한다", async () => {
    const { fetchMock, snapshot } = await startLocalMystery("solo", {
      loseQuestionRequestOnce: true,
    });
    await submitLocalMysteryQuestion("먹을 수 있나요?");

    expect(screen.getByRole("alert")).toHaveTextContent("질문 요청 연결이 끊겼습니다");
    expect(screen.getByLabelText("예 또는 아니오 질문하기")).toHaveValue("먹을 수 있나요?");
    expect(snapshot().mysteryActivityCount).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "이 활동 다시 확인하기" }));
    await flushLocalMystery();

    const requestBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.body && (
        JSON.parse(String(init.body)).action === "mystery-submit-question"
      ))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1].requestId).toBe(requestBodies[0].requestId);
    expect(snapshot().mysteryActivityCount).toBe(1);
    expect(screen.getAllByText("먹을 수 있나요?")).toHaveLength(1);
  });

  it.each(["network", "503"] as const)(
    "인공지능 차례 %s 실패는 차례와 활동을 유지하고 다시 시도해 한 번만 진행한다",
    async (failureKind) => {
      const { fetchMock, snapshot } = await startLocalMystery("ai", {
        failAiOnce: failureKind,
      });
      vi.useFakeTimers();
      await submitLocalMysteryQuestion("먹을 수 있나요?");
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      await flushLocalMystery();

      expect(screen.getByRole("alert")).toHaveTextContent(
        failureKind === "network"
          ? "인공지능 차례 연결이 끊겼습니다"
          : "인공지능 차례를 진행하지 못했습니다",
      );
      expect(snapshot()).toMatchObject({
        version: 2,
        mysteryActivityCount: 1,
        mysteryNextStep: "AI_TURN",
      });
      fireEvent.click(screen.getByRole("button", { name: /다시/ }));
      await flushLocalMystery();

      expect(snapshot()).toMatchObject({
        version: 3,
        mysteryActivityCount: 2,
        aiTurnCount: 1,
        mysteryNextStep: "STUDENT_ACTION",
      });
      const aiBodies = fetchMock.mock.calls
        .filter(([, init]) => init?.body && (
          JSON.parse(String(init.body)).action === "mystery-ai-turn"
        ))
        .map(([, init]) => JSON.parse(String(init?.body)));
      expect(aiBodies).toHaveLength(2);
      if (failureKind === "network") {
        expect(aiBodies[1].requestId).toBe(aiBodies[0].requestId);
      } else {
        expect(aiBodies[1].requestId).not.toBe(aiBodies[0].requestId);
      }
      expect(screen.getAllByText("작은가요?")).toHaveLength(1);
    },
  );

  it("학생 활동 복구 중 만료된 실행은 비밀을 숨기고 새 실행 안내로 전환한다", async () => {
    const { snapshot } = await startLocalMystery("solo", {
      closeQuestionRequestOnce: "EXPIRED",
    });
    await submitLocalMysteryQuestion("먹을 수 있나요?");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "질문놀이 상태가 다른 화면에서 변경되었습니다",
    );
    expect(screen.getByRole("button", { name: "새 실행 시작하기" })).toBeVisible();
    expect(snapshot()).toMatchObject({
      status: "EXPIRED",
      version: 2,
      questionCount: 0,
      mysteryActivityCount: 0,
      mysteryNextStep: "STUDENT_ACTION",
      mysteryWinner: null,
      mysteryEndReason: null,
      mysteryAnswerItemId: null,
    });
    expect(screen.queryByText("사과")).not.toBeInTheDocument();
  });

  it("인공지능 차례 복구 중 포기된 실행은 교대 상태를 읽고 새 실행 안내로 전환한다", async () => {
    const { snapshot } = await startLocalMystery("ai", {
      closeAiRequestOnce: "ABANDONED",
    });
    vi.useFakeTimers();
    await submitLocalMysteryQuestion("먹을 수 있나요?");
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    await flushLocalMystery();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "질문놀이 상태가 다른 화면에서 변경되었습니다",
    );
    expect(screen.getByRole("button", { name: "새 실행 시작하기" })).toBeVisible();
    expect(snapshot()).toMatchObject({
      status: "ABANDONED",
      version: 3,
      questionCount: 1,
      aiTurnCount: 0,
      awaitingAiTurn: true,
      mysteryActivityCount: 1,
      mysteryNextStep: "AI_TURN",
      mysteryWinner: null,
      mysteryEndReason: null,
      mysteryAnswerItemId: null,
    });
    expect(screen.queryByText("사과")).not.toBeInTheDocument();
  });

  it("마지막 정답 응답이 유실되어도 결과 조회로 정답과 포인트를 한 번 복구한다", async () => {
    const { fetchMock } = await startLocalMystery("solo", {
      loseFinalResponse: true,
    });
    await submitLocalMysteryGuess("사과");

    expect(await screen.findByText("정답을 맞혔어요!")).toBeVisible();
    expect(screen.getAllByText("사과").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent("+2점 적립!");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/result")))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.body && (
      JSON.parse(String(init.body)).action === "mystery-submit-guess"
    ))).toHaveLength(1);
  });

  it("정답 추측과 다른 물건 식별값이 담긴 완료 응답은 화면에 적용하지 않는다", async () => {
    await startLocalMystery("solo", { settledAnswerItemId: "book" });
    await submitLocalMysteryGuess("사과");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "미스터리 박스 진행 결과를 확인할 수 없습니다",
    );
    expect(screen.queryByText("정답을 맞혔어요!")).not.toBeInTheDocument();
    expect(screen.queryByText("책")).not.toBeInTheDocument();
  });

  it("현재 언어의 정답 별칭과 일치하는 완료 응답은 정상적으로 적용한다", async () => {
    await startLocalMystery();
    await submitLocalMysteryGuess("풋사과");

    expect(await screen.findByText("정답을 맞혔어요!")).toBeVisible();
    expect(screen.getByText("사과")).toBeVisible();
    expect(screen.getByText("풋사과")).toBeVisible();
  });

  it("이전의 실제 정답 추측을 오답으로 기록한 성공 응답은 화면에 적용하지 않는다", async () => {
    await startLocalMystery("solo", { forceFirstMatchingGuessFalse: true });
    await submitLocalMysteryGuess("사과");
    await submitLocalMysteryGuess("풋사과");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "미스터리 박스 진행 결과를 확인할 수 없습니다",
    );
    expect(screen.queryByText("정답을 맞혔어요!")).not.toBeInTheDocument();
  });

  it("실제 정답 추측을 오답으로 기록한 횟수 제한 응답은 화면에 적용하지 않는다", async () => {
    await startLocalMystery("solo", { forceFirstMatchingGuessFalse: true });
    await submitLocalMysteryGuess("사과");
    for (let index = 0; index < 19; index += 1) {
      await submitLocalMysteryQuestion(`먹을 수 있나요 ${index + 1}?`);
    }

    expect(screen.getByRole("alert")).toHaveTextContent(
      "미스터리 박스 진행 결과를 확인할 수 없습니다",
    );
    expect(screen.queryByText("20회 활동을 모두 마쳤어요")).not.toBeInTheDocument();
  });

  it("스무 번째 질문에서 즉시 끝내고 학생 질문만 계산한 포인트를 보여 준다", async () => {
    await startLocalMystery();
    for (let index = 0; index < 20; index += 1) {
      await submitLocalMysteryQuestion(`먹을 수 있나요 ${index + 1}?`);
    }

    expect(await screen.findByText("20회 활동을 모두 마쳤어요")).toBeVisible();
    expect(screen.getByText("사과")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("+22점 적립!");
    expect(screen.queryByLabelText("예 또는 아니오 질문하기")).not.toBeInTheDocument();
  });

  it("어두운 주제에서도 기록과 답변에 대비 색 토큰을 사용한다", async () => {
    document.documentElement.classList.add("dark");
    await startLocalMystery();
    await submitLocalMysteryQuestion("먹을 수 있나요?");

    const answer = screen.getByText("예");
    expect(answer).toHaveClass("text-muted-foreground");
    const source = readFileSync(
      join(process.cwd(), "src/app/(student)/student-question-play/games/MysteryBoxGame.tsx"),
      "utf8",
    );
    expect(source).toContain("useGameRun");
    expect(source).not.toContain("useAIPlay");
    expect(source).not.toMatch(/Math\.random|itemName\s*:/);
    expect(source).toContain("bg-card");
    expect(source).toContain("text-foreground");
    expect(source).toContain("text-muted-foreground");
    expect(source).toContain("border-border");
    document.documentElement.classList.remove("dark");
  });
});
