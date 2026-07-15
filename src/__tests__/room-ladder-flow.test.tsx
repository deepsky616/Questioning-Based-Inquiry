// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl as render } from "@/__tests__/test-utils/render-with-intl";
import RoomLadder from "@/app/(student)/student-question-play/games/RoomLadder";
import {
  BUILT_IN_GAMES,
  type GameRoom,
  type RoomActionHandler,
  type RoomActionResult,
} from "@/lib/question-games-data";
import {
  createLadderState,
  readLadderState,
  type LadderQuestion,
  type LadderRoomState,
} from "@/lib/question-game-room-engines/ladder";
import { assignLadderTopics } from "@/lib/question-ladder";

const game = BUILT_IN_GAMES.find(({ id }) => id === "ladder")!;
const LONG_NAME = "이름이 매우 길어도 끝까지 보여야 하는 질문 탐구 학생 서연";
const LONG_TOPIC = "별빛이 지구에 도착하는 과정과 밤하늘의 모습이 계절마다 달라지는 까닭을 여러 관점에서 살펴보는 주제"
  .padEnd(80, "가");
const LONG_QUESTION = `${"가".repeat(199)}?`;
const players: GameRoom["players"] = [
  { id: "host", name: LONG_NAME, isHost: true, joinedAt: 1 },
  { id: "guest", name: "참가자 민준", isHost: false, joinedAt: 2 },
];
const PLAY_ID = "30000000-0000-4000-8000-000000000001";
const NEXT_PLAY_ID = "30000000-0000-4000-8000-000000000002";
const ROUND_IDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
] as const;
const COMMAND_ID = "20000000-0000-4000-8000-000000000001";
const NEXT_COMMAND_ID = "20000000-0000-4000-8000-000000000002";
const GRID = [
  [true],
  [false],
  [false],
  [false],
  [false],
  [false],
  [false],
  [false],
  [false],
  [false],
];
const TOPICS = [LONG_TOPIC, "물의 순환"];
const OPEN_CONCEPTUAL = {
  closure: "open",
  cognitive: "conceptual",
  closureScore: 0.25,
  cognitiveScore: 0.92,
  reasoning: "원인과 결과를 이어서 생각하는 질문이에요.",
  feedback: "서로 다른 경우를 비교하면 생각을 더 넓힐 수 있어요.",
  inappropriate: false,
  inappropriateReason: "",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeRoom(
  state: LadderRoomState,
  overrides: Partial<GameRoom> = {},
): GameRoom {
  return {
    code: "1234",
    gameId: "ladder",
    hostId: "host",
    status: state.phase === "done" ? "ended" : "playing",
    players,
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: state,
    version: 7,
    createdAt: 10,
    updatedAt: 10,
    playId: PLAY_ID,
    ...overrides,
  };
}

function makeAssignments() {
  return assignLadderTopics(TOPICS, GRID).map((assignment, index) => ({
    playerId: players[index].id,
    playerName: players[index].name,
    ...assignment,
  }));
}

function makeQuestion(round: number, playerIndex: number): LadderQuestion {
  const assignment = makeAssignments()[playerIndex];
  return {
    roundId: ROUND_IDS[round - 1],
    round,
    playerId: assignment.playerId,
    playerName: assignment.playerName,
    topic: assignment.topic,
    question: `${round}라운드 ${assignment.topic}은 왜 중요할까요?`,
    locale: "ko",
  };
}

function makeComposeState(
  round = 1,
  currentSubmitted: readonly ("host" | "guest")[] = [],
): LadderRoomState {
  const history = Array.from({ length: round - 1 }, (_, index) => index + 1)
    .flatMap((priorRound) => [
      makeQuestion(priorRound, 0),
      makeQuestion(priorRound, 1),
    ]);
  const current = currentSubmitted.map((playerId) =>
    makeQuestion(round, playerId === "host" ? 0 : 1));
  const state: LadderRoomState = {
    ...createLadderState(),
    phase: "compose",
    round,
    roundId: ROUND_IDS[round - 1],
    topicPool: [...TOPICS],
    roundTopics: [...TOPICS],
    grid: GRID.map((row) => [...row]),
    roundPlayerIds: players.map(({ id }) => id),
    roundTargetPlayerIds: players.map(({ id }) => id),
    assignments: makeAssignments(),
    questions: [...history, ...current],
  };
  expect(readLadderState(state)).not.toBeNull();
  return state;
}

function makeDoneState(): LadderRoomState {
  const beforeLastSubmission = makeComposeState(3, ["host"]);
  const state: LadderRoomState = {
    ...beforeLastSubmission,
    phase: "done",
    endReason: "completed",
    questions: [
      ...beforeLastSubmission.questions,
      makeQuestion(3, 1),
    ],
  };
  expect(readLadderState(state)).not.toBeNull();
  return state;
}

function success(room: GameRoom): RoomActionResult {
  return { ok: true, room };
}

function failure(room: GameRoom): RoomActionResult {
  return { ok: false, room, status: 409, reason: "conflict" };
}

function requestFailure(
  room: GameRoom,
  reason: "conflict" | "network" | "rejected",
): RoomActionResult {
  return {
    ok: false,
    room,
    status: reason === "conflict" ? 409 : reason === "rejected" ? 400 : null,
    reason,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function makeProps(
  room: GameRoom,
  onAction: RoomActionHandler = vi.fn<RoomActionHandler>(),
  myId = "host",
) {
  return {
    game,
    room,
    myId,
    actionLoading: false,
    onAction,
    onLeave: vi.fn(),
  };
}

async function openHelpFailureAndConfirm(question: string) {
  const input = screen.getByRole("textbox", { name: /주제 질문$/ });
  fireEvent.change(input, { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "도움말 없이 확정" }),
  );
  return input;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 500)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("친구 방 질문 사다리 핵심 흐름", () => {
  it("공용 요청 중에는 준비, 진행 및 결과 화면에서 나가기를 잠근다", () => {
    const insufficient: LadderRoomState = {
      ...createLadderState(),
      phase: "done",
      endReason: "insufficient-players",
    };
    const rooms = [
      makeRoom(createLadderState()),
      makeRoom(makeComposeState()),
      makeRoom(makeDoneState()),
      makeRoom(insufficient, { players: [players[0]] }),
    ];

    for (const room of rooms) {
      const view = render(
        <RoomLadder
          {...makeProps(room)}
          actionLoading={true}
        />,
      );
      expect(screen.getByRole("button", { name: /나가기/ })).toBeDisabled();
      view.unmount();
    }
  });

  it("방장 준비는 다듬은 주제와 실행 식별값만 서버 명령으로 보낸다", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => COMMAND_ID) });
    const room = makeRoom(createLadderState());
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(success(room));
    render(<RoomLadder {...makeProps(room, onAction)} />);

    const topicInputs = screen.getAllByRole("textbox");
    fireEvent.change(topicInputs[0], { target: { value: "  우주  " } });
    fireEvent.change(topicInputs[1], { target: { value: " 물의 순환 " } });
    fireEvent.click(screen.getByRole("button", { name: /사다리.*준비|사다리 그리기/ }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenCalledWith(
      "ladder-prepare",
      { playId: PLAY_ID, topics: ["우주", "물의 순환"] },
      {
        commandId: COMMAND_ID,
        expectedRoom: { code: room.code, createdAt: room.createdAt },
      },
    );
    expect(onAction.mock.calls[0]?.[1]).not.toEqual(expect.objectContaining({
      grid: expect.anything(),
      assignments: expect.anything(),
      roundId: expect.anything(),
      playerId: expect.anything(),
    }));
  });

  it("비방장은 준비 입력과 명령 단추를 볼 수 없다", () => {
    const room = makeRoom(createLadderState());
    const onAction = vi.fn<RoomActionHandler>();
    render(<RoomLadder {...makeProps(room, onAction, "guest")} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /사다리.*준비|사다리 그리기/ })).not.toBeInTheDocument();
    expect(screen.getByText(/방장.*주제.*준비|방장이 주제를 정하는 중/)).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it.each([
    { name: "빈 주제", value: "   ", error: /주제를 입력/ },
    { name: "팔십일 자 주제", value: "가".repeat(81), error: /80자|팔십 자/ },
  ])("$name는 준비 명령을 보내지 않고 입력 가까이에 오류를 보인다", ({
    value,
    error,
  }) => {
    const room = makeRoom(createLadderState());
    const onAction = vi.fn<RoomActionHandler>();
    render(<RoomLadder {...makeProps(room, onAction)} />);

    const topicInputs = screen.getAllByRole("textbox");
    fireEvent.change(topicInputs[0], { target: { value } });
    fireEvent.change(topicInputs[1], { target: { value: "물의 순환" } });
    fireEvent.click(screen.getByRole("button", { name: /사다리.*준비|사다리 그리기/ }));

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(error);
  });

  it.each([
    ["새 실행", (room: GameRoom): GameRoom => ({
      ...room,
      playId: NEXT_PLAY_ID,
      version: room.version + 1,
    })],
    ["참가자 식별값 교체", (room: GameRoom): GameRoom => ({
      ...room,
      players: [room.players[0], { ...room.players[1], id: "guest-next" }],
      version: room.version + 1,
    })],
    ["참가자 이름 교체", (room: GameRoom): GameRoom => ({
      ...room,
      players: [room.players[0], { ...room.players[1], name: "새 참가자 이름" }],
      version: room.version + 1,
    })],
  ] as const)("준비 요청 도중 %s 뒤에는 새 명령을 바로 보내고 옛 실패를 무시한다", async (
    _label,
    changeLifetime,
  ) => {
    let commandIndex = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => [COMMAND_ID, NEXT_COMMAND_ID][commandIndex++] ?? NEXT_COMMAND_ID),
    });
    const firstRoom = makeRoom(createLadderState());
    const nextRoom = changeLifetime(makeRoom(createLadderState()));
    const oldRequest = deferred<RoomActionResult>();
    const onAction = vi.fn<RoomActionHandler>()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockResolvedValueOnce(success(nextRoom));
    const view = render(<RoomLadder {...makeProps(firstRoom, onAction)} />);

    const oldInputs = screen.getAllByRole("textbox");
    fireEvent.change(oldInputs[0], { target: { value: "옛 우주" } });
    fireEvent.change(oldInputs[1], { target: { value: "옛 바다" } });
    fireEvent.click(screen.getByRole("button", { name: "사다리 준비" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));

    view.rerender(
      <RoomLadder
        {...makeProps(nextRoom, onAction)}
        actionLoading={true}
      />,
    );
    const nextInputs = screen.getAllByRole("textbox");
    await waitFor(() => {
      expect(nextInputs[0]).toBeEnabled();
      expect(nextInputs[0]).toHaveValue("");
      expect(nextInputs[1]).toHaveValue("");
    });

    fireEvent.change(nextInputs[0], { target: { value: "새 우주" } });
    fireEvent.change(nextInputs[1], { target: { value: "새 바다" } });
    fireEvent.click(screen.getByRole("button", { name: "사다리 준비" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(onAction.mock.calls[1]?.[2]?.commandId).toBe(NEXT_COMMAND_ID);

    await act(async () => {
      oldRequest.resolve(failure(firstRoom));
      await oldRequest.promise;
    });
    expect(nextInputs[0]).toHaveValue("새 우주");
    expect(nextInputs[1]).toHaveValue("새 바다");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("서버 고정 그리드에서 내 실제 가로 이동만 경로 선으로 그린다", () => {
    const room = makeRoom(makeComposeState());
    render(<RoomLadder {...makeProps(room)} />);

    expect(screen.getAllByTestId("ladder-base-rung")).toHaveLength(1);
    const path = screen.getAllByTestId("ladder-path-segment");
    const horizontal = path.filter((line) => line.dataset.axis === "horizontal");
    expect(horizontal).toHaveLength(1);
    expect(horizontal[0]).toHaveAttribute("data-from-column", "0");
    expect(horizontal[0]).toHaveAttribute("data-to-column", "1");
    const startVerticals = path.filter((line) =>
      line.dataset.axis === "vertical" && line.dataset.fromColumn === "0");
    expect(startVerticals).toHaveLength(1);
    expect(startVerticals[0]).toHaveAttribute("data-to-level", "0.5");
  });

  it("지난 라운드 질문은 현재 라운드 작성을 막지 않고 현재 제출만 막는다", () => {
    const availableRoom = makeRoom(makeComposeState(2));
    const available = render(<RoomLadder {...makeProps(availableRoom)} />);

    expect(screen.getAllByText("둘째 라운드 / 셋째 라운드")).toHaveLength(2);
    expect(screen.getByRole("textbox", { name: /주제 질문$/ })).toBeInTheDocument();
    available.unmount();

    const submittedRoom = makeRoom(makeComposeState(2, ["host"]));
    render(<RoomLadder {...makeProps(submittedRoom)} />);
    expect(screen.queryByRole("button", { name: "질문 확인" })).not.toBeInTheDocument();
    expect(screen.getByText("현재 라운드 내 질문 제출 완료")).toBeInTheDocument();
  });

  it("분류 성공 뒤 확정은 현재 라운드의 좁은 서버 명령 본문만 보낸다", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => COMMAND_ID) });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(OPEN_CONCEPTUAL)));
    const room = makeRoom(makeComposeState());
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(success(room));
    render(<RoomLadder {...makeProps(room, onAction)} />);

    const input = screen.getByRole("textbox", { name: /주제 질문$/ });
    fireEvent.change(input, { target: { value: "  우주는 왜 계속 넓어질까요?  " } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    fireEvent.click(await screen.findByRole("button", { name: "이 질문 확정" }));

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenCalledWith(
      "ladder-submit-question",
      {
        playId: PLAY_ID,
        roundId: ROUND_IDS[0],
        locale: "ko",
        question: "우주는 왜 계속 넓어질까요?",
      },
      {
        commandId: COMMAND_ID,
        expectedRoom: { code: room.code, createdAt: room.createdAt },
      },
    );
    expect(onAction.mock.calls[0]?.[1]).not.toEqual(expect.objectContaining({
      playerId: expect.anything(),
      playerName: expect.anything(),
      topic: expect.anything(),
      grid: expect.anything(),
      assignment: expect.anything(),
      classification: expect.anything(),
    }));
  });

  it("분류 실패 뒤 도움말 없이 확정해도 같은 좁은 서버 명령을 보낸다", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => COMMAND_ID) });
    const room = makeRoom(makeComposeState());
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(success(room));
    render(<RoomLadder {...makeProps(room, onAction)} />);

    await openHelpFailureAndConfirm("물은 왜 계속 순환할까요?");

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction.mock.calls[0]?.slice(0, 2)).toEqual([
      "ladder-submit-question",
      {
        playId: PLAY_ID,
        roundId: ROUND_IDS[0],
        locale: "ko",
        question: "물은 왜 계속 순환할까요?",
      },
    ]);
  });

  it("충돌 뒤 질문과 같은 명령 식별값을 보존하고 성공한 뒤에만 비운다", async () => {
    let commandIndex = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => [COMMAND_ID, NEXT_COMMAND_ID][commandIndex++] ?? NEXT_COMMAND_ID),
    });
    const room = makeRoom(makeComposeState());
    const onAction = vi.fn<RoomActionHandler>()
      .mockResolvedValueOnce(failure(room))
      .mockResolvedValueOnce(success(room));
    render(<RoomLadder {...makeProps(room, onAction)} />);

    const input = await openHelpFailureAndConfirm("우주는 왜 계속 넓어질까요?");
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("우주는 왜 계속 넓어질까요?");

    fireEvent.click(screen.getByRole("button", { name: "도움말 없이 확정" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(onAction.mock.calls[0]?.[2]?.commandId).toBe(COMMAND_ID);
    expect(onAction.mock.calls[1]?.[2]?.commandId).toBe(COMMAND_ID);
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it.each([
    ["409 충돌", "conflict"],
    ["서버 거절", "rejected"],
    ["통신 실패", "network"],
    ["던진 오류", "throw"],
  ] as const)("%s 뒤 입력과 같은 명령 식별값으로 다시 보낼 수 있다", async (
    _label,
    reason,
  ) => {
    let commandIndex = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => [COMMAND_ID, NEXT_COMMAND_ID][commandIndex++] ?? NEXT_COMMAND_ID),
    });
    const room = makeRoom(makeComposeState());
    const onAction = vi.fn<RoomActionHandler>();
    if (reason === "throw") {
      onAction
        .mockRejectedValueOnce(new Error("request failed"))
        .mockResolvedValueOnce(success(room));
    } else {
      onAction
        .mockResolvedValueOnce(requestFailure(room, reason))
        .mockResolvedValueOnce(success(room));
    }
    render(<RoomLadder {...makeProps(room, onAction)} />);

    const input = await openHelpFailureAndConfirm("같은 질문을 다시 보낼 수 있을까요?");
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("같은 질문을 다시 보낼 수 있을까요?");

    fireEvent.click(screen.getByRole("button", { name: "도움말 없이 확정" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(onAction.mock.calls[0]?.[2]?.commandId).toBe(COMMAND_ID);
    expect(onAction.mock.calls[1]?.[2]?.commandId).toBe(COMMAND_ID);
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("질문 내용이 달라지면 실패한 요청의 명령 식별값을 다시 쓰지 않는다", async () => {
    let commandIndex = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => [COMMAND_ID, NEXT_COMMAND_ID][commandIndex++] ?? NEXT_COMMAND_ID),
    });
    const room = makeRoom(makeComposeState());
    const onAction = vi.fn<RoomActionHandler>()
      .mockResolvedValueOnce(failure(room))
      .mockResolvedValueOnce(success(room));
    render(<RoomLadder {...makeProps(room, onAction)} />);

    const input = await openHelpFailureAndConfirm("첫 질문은 왜 실패했을까요?");
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "다른 질문은 어떻게 보낼까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    fireEvent.click(await screen.findByRole("button", { name: "도움말 없이 확정" }));
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));

    expect(onAction.mock.calls[0]?.[2]?.commandId).toBe(COMMAND_ID);
    expect(onAction.mock.calls[1]?.[2]?.commandId).toBe(NEXT_COMMAND_ID);
  });

  it("다음 방 상태가 최근 명령과 저장 질문을 확인하면 제출 완료 대기로 바뀐다", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => COMMAND_ID) });
    const state = makeComposeState();
    const room = makeRoom(state);
    const onAction = vi.fn<RoomActionHandler>().mockResolvedValue(failure(room));
    const view = render(<RoomLadder {...makeProps(room, onAction)} />);

    const input = await openHelpFailureAndConfirm("응답을 잃어도 확인할 수 있나요?");
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("응답을 잃어도 확인할 수 있나요?");

    const confirmedState: LadderRoomState = {
      ...state,
      recentCommandIds: [COMMAND_ID],
      questions: [{
        ...makeQuestion(1, 0),
        question: "응답을 잃어도 확인할 수 있나요?",
      }],
    };
    expect(readLadderState(confirmedState)).not.toBeNull();
    view.rerender(
      <RoomLadder
        {...makeProps(makeRoom(confirmedState, { version: 8 }), onAction)}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: /주제 질문$/ })).not.toBeInTheDocument();
    });
    expect(screen.getByText("현재 라운드 내 질문 제출 완료")).toBeInTheDocument();
  });

  it("새 라운드는 이전 입력을 비우고 늦은 분류 응답을 무시한다", async () => {
    const classification = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => classification.promise));
    const firstRoom = makeRoom(makeComposeState(1));
    const view = render(<RoomLadder {...makeProps(firstRoom)} />);

    const firstInput = screen.getByRole("textbox", { name: /주제 질문$/ });
    fireEvent.change(firstInput, { target: { value: "이전 라운드 질문은 남을까요?" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 확인" }));
    expect(screen.getByText("질문을 살펴보는 중이에요...")).toBeInTheDocument();

    const secondRoom = makeRoom(makeComposeState(2), { version: 8 });
    view.rerender(<RoomLadder {...makeProps(secondRoom)} />);
    const secondInput = screen.getByRole("textbox", { name: /주제 질문$/ });
    await waitFor(() => expect(secondInput).toHaveValue(""));
    fireEvent.change(secondInput, { target: { value: "새 라운드 질문인가요?" } });

    await act(async () => { classification.resolve(jsonResponse(OPEN_CONCEPTUAL)); });
    expect(screen.getByRole("textbox", { name: /주제 질문$/ })).toHaveValue("새 라운드 질문인가요?");
    expect(screen.queryByRole("button", { name: "이 질문 확정" })).not.toBeInTheDocument();
  });

  it("제출 요청 도중 새 라운드가 오면 새 명령을 바로 보내고 옛 성공을 무시한다", async () => {
    let commandIndex = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => [COMMAND_ID, NEXT_COMMAND_ID][commandIndex++] ?? NEXT_COMMAND_ID),
    });
    const firstState = makeComposeState(1);
    const firstRoom = makeRoom(firstState);
    const secondRoom = makeRoom(makeComposeState(2), { version: 8 });
    const oldRequest = deferred<RoomActionResult>();
    const onAction = vi.fn<RoomActionHandler>()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockResolvedValueOnce(failure(secondRoom));
    const view = render(<RoomLadder {...makeProps(firstRoom, onAction)} />);

    await openHelpFailureAndConfirm("첫 라운드 질문은 어디로 갈까요?");
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));

    view.rerender(
      <RoomLadder
        {...makeProps(secondRoom, onAction)}
        actionLoading={true}
      />,
    );
    const nextInput = screen.getByRole("textbox", { name: /주제 질문$/ });
    await waitFor(() => expect(nextInput).toHaveValue(""));
    await openHelpFailureAndConfirm("새 라운드 질문은 유지될까요?");
    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
    expect(onAction.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      playId: PLAY_ID,
      roundId: ROUND_IDS[1],
      question: "새 라운드 질문은 유지될까요?",
    }));
    expect(onAction.mock.calls[1]?.[2]?.commandId).toBe(NEXT_COMMAND_ID);
    expect(nextInput).toHaveValue("새 라운드 질문은 유지될까요?");
    const currentError = await screen.findByRole("alert");
    expect(currentError).toHaveTextContent(/확정하지 못/);

    const oldConfirmedState: LadderRoomState = {
      ...firstState,
      recentCommandIds: [COMMAND_ID],
    };
    await act(async () => {
      oldRequest.resolve(success(makeRoom(oldConfirmedState, { version: 8 })));
      await oldRequest.promise;
    });
    expect(nextInput).toHaveValue("새 라운드 질문은 유지될까요?");
    expect(screen.getByRole("alert")).toHaveTextContent(/확정하지 못/);
  });

  it("완료 상태는 세 라운드 누적 질문을 보이고 수동 진행 명령을 만들지 않는다", () => {
    const room = makeRoom(makeDoneState());
    const onAction = vi.fn<RoomActionHandler>();
    render(<RoomLadder {...makeProps(room, onAction)} />);

    expect(screen.getByText("질문 사다리 완성")).toBeInTheDocument();
    for (let round = 1; round <= 3; round += 1) {
      expect(screen.getAllByText(new RegExp(`${round}라운드`)).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/왜 중요할까요\?/)).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /다음 라운드|마치기|종료|상태/ })).not.toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("참가자 부족 종료는 전용 안내와 나가기만 제공한다", () => {
    const state: LadderRoomState = {
      ...createLadderState(),
      phase: "done",
      endReason: "insufficient-players",
    };
    expect(readLadderState(state)).not.toBeNull();
    const onLeave = vi.fn();
    render(
      <RoomLadder
        {...makeProps(makeRoom(state, { players: [players[0]] }))}
        onLeave={onLeave}
      />,
    );

    expect(screen.getByText(/참가자가 부족/)).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /나가기/ }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("완료 뒤 현재 참가자가 마지막 라운드 참가자의 일부이면 결과를 보인다", () => {
    render(
      <RoomLadder
        {...makeProps(makeRoom(makeDoneState(), { players: [players[0]] }))}
      />,
    );

    expect(screen.getByText("질문 사다리 완성")).toBeInTheDocument();
    expect(screen.queryByText(/안전하게 불러오지 못/)).not.toBeInTheDocument();
  });

  it("끝 상태와 맞지 않는 놀이, 실행 및 참가자 껍데기는 안전 안내를 보인다", () => {
    const insufficientState: LadderRoomState = {
      ...createLadderState(),
      phase: "done",
      endReason: "insufficient-players",
    };
    const completedState = makeDoneState();
    const cases: GameRoom[] = [
      makeRoom(insufficientState),
      makeRoom(completedState, {
        players: [{
          id: "outside",
          name: "마지막 라운드 밖 참가자",
          isHost: true,
          joinedAt: 3,
        }],
      }),
      makeRoom(completedState, {
        players: [{ ...players[0], name: "바뀐 참가자 이름" }],
      }),
      makeRoom(completedState, { gameId: "dice" }),
      makeRoom(completedState, { playId: "not-a-version-four-id" }),
    ];

    for (const room of cases) {
      const view = render(<RoomLadder {...makeProps(room)} />);
      expect(screen.getByText(/안전하게 불러오지 못/)).toBeInTheDocument();
      expect(screen.queryByText("질문 사다리 완성")).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it.each([
    ["손상된 상태", {}],
    ["방 상태 불일치", makeComposeState()],
  ] as const)("%s에는 안전한 새로 고침 안내를 보인다", (_label, gameState) => {
    const room = makeRoom(makeComposeState(), {
      gameState,
      ...(_label === "방 상태 불일치" ? { status: "ended" } : {}),
    });
    render(<RoomLadder {...makeProps(room)} />);

    expect(
      screen.getAllByText(/안전하게 불러오지 못|새로 고쳐질 때까지/),
    ).toHaveLength(2);
    expect(screen.queryByTestId("ladder-path-segment")).not.toBeInTheDocument();
  });

  it("밝고 어두운 화면에서 긴 이름과 팔십 자 주제 및 이백 자 질문을 자르지 않고 줄바꿈한다", () => {
    expect(LONG_TOPIC).toHaveLength(80);
    expect(LONG_QUESTION).toHaveLength(200);
    const done = makeDoneState();
    const longDone: LadderRoomState = {
      ...done,
      questions: done.questions.map((question, index) =>
        index === 0 ? { ...question, question: LONG_QUESTION } : question),
    };
    expect(readLadderState(longDone)).not.toBeNull();

    render(
      <div className="dark">
        <RoomLadder {...makeProps(makeRoom(longDone))} />
      </div>,
    );

    expect(screen.getAllByText(LONG_NAME).some((node) =>
      node.classList.contains("break-words"))).toBe(true);
    expect(screen.getAllByText(LONG_TOPIC).some((node) =>
      node.classList.contains("break-words"))).toBe(true);
    expect(screen.getByText(LONG_QUESTION)).toHaveClass("break-words");

    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/(student)/student-question-play/games/RoomLadder.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("readLadderState");
    expect(source).toContain("LadderBoard");
    expect(source).toContain("LadderQuestionComposer");
    expect(source).toMatch(/bg-card/);
    expect(source).toMatch(/text-card-foreground/);
    expect(source).not.toMatch(/bg-white|text-gray-/);
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(/["'](?:set-state|update-state|next-turn)["']/);
    expect(source).not.toMatch(/status\s*:\s*["']ended["']/);
  });
});
