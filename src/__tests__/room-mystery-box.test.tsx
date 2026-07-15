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

const aiMocks = vi.hoisted(() => ({ ask: vi.fn() }));

vi.mock("@/app/(student)/student-question-play/games/useAIPlay", () => ({
  useAIPlay: () => ({ ask: aiMocks.ask, loading: false }),
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
  aiMocks.ask.mockReset();
  vi.spyOn(Math, "random").mockReturnValue(0);
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
    expect(roomSource).not.toContain("RoomResult");
    expect(pageSource).toContain("QuestionGameRoomFlow");
    expect(flowSource).toContain("RoomMysteryBox");
    expect(flowSource).toMatch(/\"mystery-box\"\s*:\s*RoomMysteryBox/);
    expect(pageSource).not.toContain('config={{ mode: "friend"');
  });
});

async function startLocal(mode: "solo" | "ai" = "solo") {
  if (mode === "ai") {
    aiMocks.ask.mockResolvedValueOnce({
      parsed: { name: "사과", category: "과일", emoji: "🍎" },
    });
  }
  render(
    <MysteryBoxGame
      game={game}
      onBack={vi.fn()}
      config={{ mode, players: mode === "ai" ? ["나", "AI"] : ["나"] }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /시작/ }));
  await screen.findByLabelText("예 또는 아니오 질문");
}

async function submitLocalQuestion(value: string, endsGame = false) {
  const input = screen.getByLabelText("예 또는 아니오 질문");
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));
  if (endsGame) {
    await waitFor(() => {
      expect(screen.queryByLabelText("예 또는 아니오 질문")).not.toBeInTheDocument();
    });
  } else {
    await waitFor(() => expect(input).toHaveValue(""));
  }
}

async function submitLocalGuess(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "정답 맞추기!" }));
  const input = screen.getByLabelText("정답 추측");
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "정답 제출!" }));
}

async function startEnglishLocal(mode: "solo" | "ai" = "solo") {
  if (mode === "ai") {
    aiMocks.ask.mockResolvedValueOnce({
      parsed: { name: "apple", category: "fruit", emoji: "🍎" },
    });
  }
  renderEnglish(
    <MysteryBoxGame
      game={game}
      onBack={vi.fn()}
      config={{ mode, players: mode === "ai" ? ["Me", "AI"] : ["Me"] }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Start/ }));
  await screen.findByLabelText("Yes-or-no question");
}

async function submitEnglishGuess(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "Guess!" }));
  const input = screen.getByLabelText("Answer guess");
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Submit answer!" }));
}

function expectLocalRemaining(value: number) {
  const label = screen.getByText("남은 활동");
  expect(label.previousElementSibling).toHaveTextContent(String(value));
}

describe("지역 미스터리 박스 활동 종료", () => {
  it("시작 화면에서 질문과 추측을 합친 활동 상한을 안내한다", () => {
    render(
      <MysteryBoxGame
        game={game}
        onBack={vi.fn()}
        config={{ mode: "solo", players: ["나"] }}
      />,
    );

    expect(screen.getByText(/질문이나 추측을 합쳐 20번/)).toBeVisible();
  });

  it("혼자 첫 틀린 추측을 기록하고 같은 학생이 다음 활동을 계속한다", async () => {
    await startLocal();
    await submitLocalGuess("책");

    expect(await screen.findByLabelText("예 또는 아니오 질문")).toBeEnabled();
    expect(screen.getByText(/책/)).toBeVisible();
    expect(screen.getByText("땡")).toBeVisible();
    expectLocalRemaining(19);
    expect(screen.queryByText("아쉬워요...")).not.toBeInTheDocument();
  });

  it("혼자 모드에서 정답 일부는 거절하고 앞뒤 공백이 있는 별칭 전체는 허용한다", async () => {
    await startLocal();
    await submitLocalGuess("사");

    expect(await screen.findByLabelText("예 또는 아니오 질문")).toBeEnabled();
    expect(screen.getByText("땡")).toBeVisible();
    await submitLocalGuess("  풋사과  ");

    expect(await screen.findAllByText(/정답!/)).toHaveLength(2);
  });

  it("혼자 모드 영문 정답은 앞뒤 공백과 대소문자를 정규화해 전체 일치시킨다", async () => {
    await startEnglishLocal();
    await submitEnglishGuess("  APPLE  ");

    expect(await screen.findAllByText(/Correct!/)).toHaveLength(2);
  });

  it("인공지능 모드의 틀린 사람 추측은 인공지능 차례로 넘긴다", async () => {
    await startLocal("ai");
    await submitLocalGuess("사");

    expect(screen.getByText(/AI.*차례/)).toBeVisible();
    expect(screen.getByText("땡")).toBeVisible();
    expectLocalRemaining(19);
  });

  it("인공지능 모드 영문 정답도 앞뒤 공백과 대소문자를 정규화해 전체 일치시킨다", async () => {
    await startEnglishLocal("ai");
    await submitEnglishGuess("  APPLE  ");

    expect(await screen.findAllByText(/Correct!/)).toHaveLength(2);
  });

  it("인공지능이 고른 내장 물건도 정답 별칭 전체를 허용한다", async () => {
    await startLocal("ai");
    await submitLocalGuess("풋사과");

    expect(await screen.findAllByText(/정답!/)).toHaveLength(2);
  });

  it("인공지능 답변을 기다리는 동안 질문 반복과 추측을 막고 한 활동만 기록한다", async () => {
    await startLocal("ai");
    const pending = deferred<{ text: string }>();
    aiMocks.ask.mockReturnValueOnce(pending.promise);

    const input = screen.getByLabelText("예 또는 아니오 질문");
    fireEvent.change(input, { target: { value: "먹을 수 있나요?" } });
    const askButton = screen.getByRole("button", { name: /질문하기/ });
    const guessButton = screen.getByRole("button", { name: "정답 맞추기!" });
    fireEvent.click(askButton);
    fireEvent.click(askButton);
    fireEvent.click(guessButton);

    expect(aiMocks.ask).toHaveBeenCalledTimes(2);
    expect(askButton).toBeDisabled();
    expect(guessButton).toBeDisabled();
    expect(screen.queryByLabelText("정답 추측")).not.toBeInTheDocument();

    await act(async () => { pending.resolve({ text: "네" }); });
    await waitFor(() => expect(screen.getByText(/AI.*차례/)).toBeVisible());
    expect(screen.getAllByText("먹을 수 있나요?")).toHaveLength(1);
    expectLocalRemaining(19);
  });

  it("인공지능 답변 오류가 나면 입력을 보존하고 활동 잠금을 푼다", async () => {
    await startLocal("ai");
    aiMocks.ask.mockRejectedValueOnce(new Error("answer failed"));

    const input = screen.getByLabelText("예 또는 아니오 질문");
    fireEvent.change(input, { target: { value: "먹을 수 있나요?" } });
    fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /질문하기/ })).toBeEnabled();
    });
    expect(input).toHaveValue("먹을 수 있나요?");
    fireEvent.click(screen.getByRole("button", { name: "정답 맞추기!" }));
    expect(screen.getByLabelText("정답 추측")).toBeEnabled();
  });

  it("인공지능 답변 요청이 실제 실패 값이면 질문과 차례를 보존하고 잠금을 푼다", async () => {
    await startLocal("ai");
    aiMocks.ask.mockResolvedValueOnce(null);

    const input = screen.getByLabelText("예 또는 아니오 질문");
    fireEvent.change(input, { target: { value: "먹을 수 있나요?" } });
    fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /질문하기/ })).toBeEnabled();
    });
    expect(input).toHaveValue("먹을 수 있나요?");
    expect(screen.getByText(/나.*차례/)).toBeVisible();
    expect(screen.queryByText("잘 모르겠어요")).not.toBeInTheDocument();
    expectLocalRemaining(20);
    expect(screen.getByRole("button", { name: "정답 맞추기!" })).toBeEnabled();
  });

  it("인공지능이 실제로 모르는 답을 보내면 정상 활동으로 기록한다", async () => {
    await startLocal("ai");
    aiMocks.ask.mockResolvedValueOnce({ text: "잘 모르겠어요" });

    const input = screen.getByLabelText("예 또는 아니오 질문");
    fireEvent.change(input, { target: { value: "먹을 수 있나요?" } });
    fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));

    await waitFor(() => expect(screen.getByText(/AI.*차례/)).toBeVisible());
    expect(screen.getByText("잘 모르겠어요")).toBeVisible();
    expectLocalRemaining(19);
  });

  it("인공지능 차례의 답 요청이 실패하면 활동을 쓰지 않고 사람 차례로 돌아온다", async () => {
    await startLocal("ai");
    aiMocks.ask
      .mockResolvedValueOnce({ parsed: { question: "둥근가요?" } })
      .mockResolvedValueOnce(null);
    vi.useFakeTimers();

    await submitLocalGuess("책");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(aiMocks.ask).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/나.*차례/)).toBeVisible();
    expect(screen.queryByText("둥근가요?")).not.toBeInTheDocument();
    expect(screen.queryByText("잘 모르겠어요")).not.toBeInTheDocument();
    expectLocalRemaining(19);
  });

  it("인공지능 차례 만들기가 실패해도 활동을 쓰지 않고 사람 차례로 돌아온다", async () => {
    await startLocal("ai");
    aiMocks.ask.mockResolvedValueOnce(null);
    vi.useFakeTimers();

    await submitLocalGuess("책");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(aiMocks.ask).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/나.*차례/)).toBeVisible();
    expectLocalRemaining(19);
  });

  it("같은 화면 순간의 추측 엔터와 단추 제출은 한 번만 차례를 넘긴다", async () => {
    await startLocal("ai");
    fireEvent.click(screen.getByRole("button", { name: "정답 맞추기!" }));
    const input = screen.getByLabelText("정답 추측");
    const submit = screen.getByRole("button", { name: "정답 제출!" });
    fireEvent.change(input, { target: { value: "책" } });

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(screen.getByText(/AI.*차례/)).toBeVisible();
    expect(screen.getAllByText(/책/)).toHaveLength(1);
    expect(screen.getAllByText("땡")).toHaveLength(1);
    expectLocalRemaining(19);
  });

  it("스무 번째 질문에서 바로 끝내고 스물한 번째 강제 추측을 열지 않는다", async () => {
    await startLocal();
    for (let index = 0; index < 20; index += 1) {
      await submitLocalQuestion(`먹을 수 있나요? ${index + 1}`, index === 19);
    }

    expect(await screen.findByText("아쉬워요...")).toBeVisible();
    expect(screen.getByText("사과")).toBeVisible();
    expect(screen.queryByLabelText("정답 추측")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "정답 제출!" })).not.toBeInTheDocument();
  });

  it("스무 번째 틀린 추측을 기록한 뒤 끝낸다", async () => {
    await startLocal();
    for (let index = 0; index < 20; index += 1) {
      await submitLocalGuess(`틀린 답 ${index + 1}`);
      if (index < 19) await screen.findByLabelText("예 또는 아니오 질문");
    }

    expect(await screen.findByText("아쉬워요...")).toBeVisible();
    expect(screen.getByText(/틀린 답 20/)).toBeVisible();
    expect(screen.queryByLabelText("예 또는 아니오 질문")).not.toBeInTheDocument();
  });

  it("정답 추측은 스무 활동 전에도 즉시 성공 종료한다", async () => {
    await startLocal();
    await submitLocalGuess("사과");

    expect(await screen.findAllByText(/정답!/)).toHaveLength(2);
    expect(screen.getAllByText("사과").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("예 또는 아니오 질문")).not.toBeInTheDocument();
  });

  it("지역 화면도 공통 모드별 활동 상한과 주제 색 토큰을 쓴다", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/(student)/student-question-play/games/MysteryBoxGame.tsx"),
      "utf8",
    );
    expect(source).toContain('QUESTION_GAME_RULES["mystery-box"].targets');
    expect(source).not.toMatch(/const\s+MAX_Q\s*=\s*20/);
    expect(source).toContain("bg-card");
    expect(source).toContain("text-foreground");
    expect(source).toContain("text-muted-foreground");
    expect(source).toContain("border-border");
    expect(source).not.toContain("GameResultReview");
  });
});
