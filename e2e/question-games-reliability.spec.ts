import { expect, test, type Page } from "@playwright/test";
import {
  closeQuestionGameSessions,
  createExtraStudentIdentity,
  createQuestionGameBrowserFixture,
  createSharedQuestionGameTransport,
  expectLadderPathGeometry,
  expectLoadingRingContrast,
  expectNoBoxOverlap,
  expectNoHorizontalPageOverflow,
  expectSvgStrokeContrast,
  expectTextContrast,
  joinStudentRoom,
  openQuestionGameContext,
  openStudentJoinPage,
  openStudentRoom,
  openTeacherRoom,
  submitQuestionGameRoomCode,
  type QuestionGameBrowserSession,
} from "./helpers/question-game-room";
import { getMysteryItem } from "../src/lib/mystery-box-rules";

test.describe.configure({ mode: "serial" });

const QUESTION_GAME_PREPARATION_CASES = [
  { id: "memory", title: "질문-대답 짝 찾기" },
  { id: "story-dice", title: "이야기 주사위" },
  { id: "dice", title: "질문 주사위" },
  { id: "ladder", title: "질문 사다리" },
  { id: "relay", title: "질문 릴레이" },
  { id: "mystery-box", title: "미스터리 박스" },
  { id: "kaba", title: "까바놀이" },
] as const;

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "공유 방 브라우저 검증은 데스크톱 크로미움에서 한 번 실행합니다",
  );
});

async function submitLadderQuestion(
  page: Page,
  question: string,
) {
  const input = page.locator('textarea[id^="ladder-question-"]');
  await expect(input).toBeVisible();
  await input.fill(question);
  await page.getByRole("button", { name: "질문 확인", exact: true }).click();
  const confirm = page.getByRole("button", {
    name: "이 질문 확정",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  await confirm.click();
}

function sessionForPlayer(
  sessions: readonly QuestionGameBrowserSession[],
  playerId: string,
) {
  const session = sessions.find(({ identity }) => identity.id === playerId);
  if (!session) throw new Error("현재 차례 학생 화면을 찾을 수 없습니다");
  return session;
}

async function startFriendGame(
  host: QuestionGameBrowserSession,
  code: string,
  transport: ReturnType<typeof createSharedQuestionGameTransport>,
) {
  await host.page.getByRole("button", { name: /게임 시작/ }).click();
  await expect.poll(() => transport.getRoom(code)?.status).toBe("playing");
}

async function expectFriendCompletion(
  sessions: readonly QuestionGameBrowserSession[],
  code: string,
  transport: ReturnType<typeof createSharedQuestionGameTransport>,
) {
  await expect.poll(() => transport.getRoom(code)?.status).toBe("ended");
  for (const session of sessions) {
    await expect(
      session.page.getByRole("heading", { name: "나의 질문학습 결과" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect.poll(
      () => transport.awardedPointsFor(session.identity.id),
    ).toBeGreaterThan(0);
    await expect(
      session.page.getByText("받은 포인트", { exact: true }).locator(".."),
    ).toContainText(String(transport.awardedPointsFor(session.identity.id)));
    await expectNoHorizontalPageOverflow(session.page);
  }
}

async function completeRelay(
  sessions: readonly QuestionGameBrowserSession[],
  code: string,
  transport: ReturnType<typeof createSharedQuestionGameTransport>,
) {
  const host = sessions[0];
  await startFriendGame(host, code, transport);
  await host.page.locator("#relay-topic").fill("별과 우주");
  await host.page.locator("#relay-topic").press("Enter");
  await expect.poll(() => transport.getRoom(code)?.gameState.phase).toBe("question");

  let questionCount = 0;
  while (transport.getRoom(code)?.status !== "ended") {
    const state = transport.getRoom(code)?.gameState as {
      turnOrder?: string[];
      currentTurnIdx?: number;
      questions?: unknown[];
    };
    const playerId = state.turnOrder?.[state.currentTurnIdx ?? -1] ?? "";
    const page = sessionForPlayer(sessions, playerId).page;
    const input = page.locator("#relay-question-input");
    await expect(input).toBeEnabled();
    questionCount += 1;
    await input.fill(`별과 우주는 ${questionCount}번째로 어떻게 이어질까요?`);
    await input.press("Enter");
    await expect.poll(
      () => (transport.getRoom(code)?.gameState.questions as unknown[] | undefined)?.length ?? 0,
    ).toBe(questionCount);
  }
}

async function completeDice(
  sessions: readonly QuestionGameBrowserSession[],
  code: string,
  transport: ReturnType<typeof createSharedQuestionGameTransport>,
) {
  await startFriendGame(sessions[0], code, transport);
  let questionCount = 0;
  while (transport.getRoom(code)?.status !== "ended") {
    const state = transport.getRoom(code)?.gameState as {
      phase?: string;
      turnOrder?: string[];
      currentTurnIdx?: number;
      questions?: unknown[];
    };
    const playerId = state.turnOrder?.[state.currentTurnIdx ?? -1] ?? "";
    const page = sessionForPlayer(sessions, playerId).page;
    if (state.phase === "roll") {
      const roll = page.getByRole("button", { name: "주사위 굴리기", exact: true });
      await expect(roll).toBeEnabled();
      await roll.click();
      await expect.poll(() => transport.getRoom(code)?.gameState.phase).toBe("question");
      continue;
    }
    const input = page.locator("#dice-question-input");
    await expect(input).toBeEnabled();
    questionCount += 1;
    await input.fill(`이 주제를 ${questionCount}번째로 어떻게 탐구할까요?`);
    await input.press("Enter");
    await expect.poll(
      () => (transport.getRoom(code)?.gameState.questions as unknown[] | undefined)?.length ?? 0,
    ).toBe(questionCount);
  }
}

async function completeStoryDice(
  sessions: readonly QuestionGameBrowserSession[],
  code: string,
  transport: ReturnType<typeof createSharedQuestionGameTransport>,
) {
  const host = sessions[0];
  await startFriendGame(host, code, transport);
  await host.page.getByRole("button", { name: "이야기 준비하기", exact: true }).click();
  await expect.poll(() => transport.getRoom(code)?.gameState.phase).toBe("roll");
  await host.page.getByRole("button", { name: "이야기 주사위 굴리기", exact: true }).click();
  await expect.poll(() => transport.getRoom(code)?.gameState.phase).toBe("story");
  await host.page.locator("#story-turn-input").fill("별을 찾아 우주로 떠나는 이야기를 만들었어요.");
  await host.page.locator("#story-turn-input").press("Enter");

  let pairCount = 0;
  while (transport.getRoom(code)?.status !== "ended") {
    const state = transport.getRoom(code)?.gameState as {
      phase?: string;
      taggerId?: string;
      turnOrder?: string[];
      currentTurnIdx?: number;
      pairs?: unknown[];
    };
    const playerId = state.phase === "question"
      ? state.turnOrder?.[state.currentTurnIdx ?? -1]
      : state.taggerId;
    const page = sessionForPlayer(sessions, playerId ?? "").page;
    const input = page.locator("#story-turn-input");
    await expect(input).toBeEnabled();
    if (state.phase === "question") {
      await input.fill(`이 이야기에서 ${pairCount + 1}번째로 가장 궁금한 점은 무엇일까요?`);
      await input.press("Enter");
      await expect.poll(() => transport.getRoom(code)?.gameState.phase).toBe("answer");
    } else {
      await input.fill(`${pairCount + 1}번째 궁금증은 새로운 별을 찾는 과정과 이어집니다.`);
      await input.press("Enter");
      pairCount += 1;
      await expect.poll(
        () => (transport.getRoom(code)?.gameState.pairs as unknown[] | undefined)?.length ?? 0,
      ).toBe(pairCount);
    }
  }
}

async function completeKaba(
  sessions: readonly QuestionGameBrowserSession[],
  code: string,
  transport: ReturnType<typeof createSharedQuestionGameTransport>,
) {
  const host = sessions[0];
  await startFriendGame(host, code, transport);
  await host.page.getByRole("button", { name: "문장 준비하기", exact: true }).click();
  await expect.poll(() => transport.getRoom(code)?.gameState.phase).toBe("question");

  let attemptCount = 0;
  while (transport.getRoom(code)?.status !== "ended") {
    const state = transport.getRoom(code)?.gameState as {
      turnOrder?: string[];
      currentTurnIdx?: number;
      attempts?: unknown[];
    };
    const playerId = state.turnOrder?.[state.currentTurnIdx ?? -1] ?? "";
    const input = sessionForPlayer(sessions, playerId).page.locator("#kaba-question-input");
    await expect(input).toBeEnabled();
    attemptCount += 1;
    await input.fill(`이 문장의 뜻을 ${attemptCount}번째로 어떻게 물어볼까요?`);
    await input.press("Enter");
    await expect.poll(
      () => (transport.getRoom(code)?.gameState.attempts as unknown[] | undefined)?.length ?? 0,
    ).toBe(attemptCount);
  }
}

async function completeMystery(
  sessions: readonly QuestionGameBrowserSession[],
  code: string,
  transport: ReturnType<typeof createSharedQuestionGameTransport>,
) {
  const host = sessions[0];
  await startFriendGame(host, code, transport);
  await host.page.getByRole("button", { name: "미스터리 상자 시작", exact: true }).click();
  await expect.poll(() => transport.getRoom(code)?.gameState.phase).toBe("play");
  const state = transport.getRoom(code)?.gameState as {
    private?: { itemId?: string };
    turnOrder?: string[];
    currentTurnIdx?: number;
  };
  const item = state.private?.itemId ? getMysteryItem(state.private.itemId) : null;
  expect(item).not.toBeNull();
  const playerId = state.turnOrder?.[state.currentTurnIdx ?? -1] ?? "";
  const page = sessionForPlayer(sessions, playerId).page;
  await page.locator("#room-mystery-guess").fill(item!.names.ko);
  await page.getByRole("button", { name: "추측 보내기", exact: true }).click();
}

async function completeMemory(
  sessions: readonly QuestionGameBrowserSession[],
  code: string,
  transport: ReturnType<typeof createSharedQuestionGameTransport>,
) {
  const host = sessions[0];
  const friend = sessions[1];
  await startFriendGame(host, code, transport);
  await host.page.getByRole("button", { name: /쉬움/ }).click();
  await host.page.getByRole("button", { name: /주사위 굴리기/ }).click();
  await expect(friend.page.getByRole("button", { name: /주사위 굴리기/ })).toBeEnabled();
  await friend.page.getByRole("button", { name: /주사위 굴리기/ }).click();
  await expect.poll(() => transport.getRoom(code)?.gameState.phase).toBe("play");

  while (transport.getRoom(code)?.status !== "ended") {
    const state = transport.getRoom(code)?.gameState as {
      turnOrder?: string[];
      currentTurnIdx?: number;
      qCards?: Array<{ id: string; pairId: string }>;
      aCards?: Array<{ id: string; pairId: string }>;
      takenIds?: string[];
    };
    const playerId = state.turnOrder?.[state.currentTurnIdx ?? -1] ?? "";
    const page = sessionForPlayer(sessions, playerId).page;
    const taken = new Set(state.takenIds ?? []);
    const questionIndex = state.qCards?.findIndex(({ id }) => !taken.has(id)) ?? -1;
    const questionCard = state.qCards?.[questionIndex];
    const answerIndex = state.aCards?.findIndex(
      ({ id, pairId }) => !taken.has(id) && pairId === questionCard?.pairId,
    ) ?? -1;
    expect(questionIndex).toBeGreaterThanOrEqual(0);
    expect(answerIndex).toBeGreaterThanOrEqual(0);
    await page.getByRole("button", { name: `질문 카드 ${questionIndex + 1}` }).click();
    await expect.poll(
      () => (transport.getRoom(code)?.gameState.revealedIds as unknown[] | undefined)?.length ?? 0,
    ).toBe(1);
    await page.getByRole("button", { name: `대답 카드 ${answerIndex + 1}` }).click();
    await expect.poll(
      () => (transport.getRoom(code)?.gameState.takenIds as unknown[] | undefined)?.length ?? 0,
    ).toBe(taken.size + 2);
  }
}

const FULL_COMPLETION_CASES = [
  { id: "relay", title: "질문 릴레이", complete: completeRelay },
  { id: "dice", title: "질문 주사위", complete: completeDice },
  { id: "story-dice", title: "이야기 주사위", complete: completeStoryDice },
  { id: "kaba", title: "까바놀이", complete: completeKaba },
  { id: "mystery-box", title: "미스터리 박스", complete: completeMystery },
  { id: "memory", title: "질문-대답 짝 찾기", complete: completeMemory },
] as const;

for (const completionCase of FULL_COMPLETION_CASES) {
  test(`${completionCase.title}를 두 학생이 끝내고 각자 포인트를 받는다`, async ({ browser }) => {
    test.slow();
    const fixture = createQuestionGameBrowserFixture(`complete-${completionCase.id}`);
    const transport = createSharedQuestionGameTransport();
    const sessions: QuestionGameBrowserSession[] = [];

    try {
      const host = await openStudentRoom(
        browser,
        fixture.students[0],
        completionCase.id,
        transport,
      );
      const friend = await joinStudentRoom(
        browser,
        fixture.students[1],
        completionCase.id,
        host.code,
        transport,
      );
      sessions.push(host, friend);
      await completionCase.complete(sessions, host.code, transport);
      await expectFriendCompletion(sessions, host.code, transport);
    } finally {
      await closeQuestionGameSessions(sessions);
      await transport.dispose();
    }
  });
}

test("두 명 전에는 시작할 수 없고 두 명이면 시작한다", async ({ browser }) => {
  const fixture = createQuestionGameBrowserFixture("minimum");
  const transport = createSharedQuestionGameTransport();
  const sessions: QuestionGameBrowserSession[] = [];

  try {
    const host = await openStudentRoom(
      browser,
      fixture.students[0],
      "mystery-box",
      transport,
    );
    sessions.push(host);
    const start = host.page.getByRole("button", { name: /게임 시작/ });
    await expect(start).toBeDisabled();
    await expect(host.page.getByRole("status")).toContainText(
      "친구가 한 명 이상 더 참가해야 시작할 수 있어요",
    );

    const friend = await joinStudentRoom(
      browser,
      fixture.students[1],
      "mystery-box",
      host.code,
      transport,
    );
    sessions.push(friend);
    await expect(start).toBeEnabled({ timeout: 10_000 });
    await start.click();
    await expect.poll(() => transport.getRoom(host.code)?.status).toBe("playing");
    await expect(
      host.page.getByRole("button", { name: "미스터리 상자 시작" }),
    ).toBeVisible();
  } finally {
    await closeQuestionGameSessions(sessions);
    await transport.dispose();
  }
});

test("학생 여덟 명까지 참가하고 아홉 번째 참가를 거절한다", async ({ browser }) => {
  test.slow();
  const fixture = createQuestionGameBrowserFixture("student-capacity");
  const ninth = createExtraStudentIdentity("student-capacity");
  const transport = createSharedQuestionGameTransport();
  const sessions: QuestionGameBrowserSession[] = [];

  try {
    const host = await openStudentRoom(
      browser,
      fixture.students[0],
      "relay",
      transport,
    );
    sessions.push(host);
    for (const student of fixture.students.slice(1)) {
      sessions.push(await joinStudentRoom(
        browser,
        student,
        "relay",
        host.code,
        transport,
      ));
    }
    await expect.poll(() => transport.getRoom(host.code)?.players.length).toBe(8);

    const rejected = await openStudentJoinPage(
      browser,
      ninth,
      "relay",
      transport,
    );
    sessions.push(rejected);
    await submitQuestionGameRoomCode(rejected.page, host.code);
    await expect(rejected.page.getByRole("alert").filter({
      hasText: "방이 가득 찼어요 (최대 8명)",
    })).toBeVisible();
    expect(transport.getRoom(host.code)?.players).toHaveLength(8);
    await expect(
      host.page.getByRole("heading", { name: /참가자 8/ }),
    ).toBeVisible();
    const start = host.page.getByRole("button", { name: /게임 시작/ });
    await expect(start).toBeEnabled();
    await start.click();
    await expect.poll(() => transport.getRoom(host.code)?.status).toBe("playing");
    expect(transport.getRoom(host.code)?.players).toHaveLength(8);
  } finally {
    await closeQuestionGameSessions(sessions);
    await transport.dispose();
  }
});

test("교사와 학생 일곱 명까지 참가하고 아홉 번째 참가를 거절한다", async ({ browser }) => {
  test.slow();
  const fixture = createQuestionGameBrowserFixture("teacher-capacity");
  const transport = createSharedQuestionGameTransport();
  const sessions: QuestionGameBrowserSession[] = [];

  try {
    const host = await openTeacherRoom(
      browser,
      fixture.teacher,
      "dice",
      transport,
    );
    sessions.push(host);
    for (const student of fixture.students.slice(0, 7)) {
      sessions.push(await joinStudentRoom(
        browser,
        student,
        "dice",
        host.code,
        transport,
      ));
    }
    await expect.poll(() => transport.getRoom(host.code)?.players.length).toBe(8);

    const rejected = await openStudentJoinPage(
      browser,
      fixture.students[7],
      "dice",
      transport,
    );
    sessions.push(rejected);
    await submitQuestionGameRoomCode(rejected.page, host.code);
    await expect(rejected.page.getByRole("alert").filter({
      hasText: "방이 가득 찼어요 (최대 8명)",
    })).toBeVisible();
    expect(transport.getRoom(host.code)?.players).toHaveLength(8);
    await expect(
      host.page.getByRole("heading", { name: /참가자 8/ }),
    ).toBeVisible();
    const start = host.page.getByRole("button", { name: /게임 시작/ });
    await expect(start).toBeEnabled();
    await start.click();
    await expect.poll(() => transport.getRoom(host.code)?.status).toBe("playing");
    expect(transport.getRoom(host.code)?.players).toHaveLength(8);
  } finally {
    await closeQuestionGameSessions(sessions);
    await transport.dispose();
  }
});

test("미스터리 질문을 공유하고 같은 학생이 재접속해 이어 간다", async ({ browser }) => {
  const fixture = createQuestionGameBrowserFixture("mystery-reconnect");
  const transport = createSharedQuestionGameTransport();
  const sessions: QuestionGameBrowserSession[] = [];

  try {
    const host = await openStudentRoom(
      browser,
      fixture.students[0],
      "mystery-box",
      transport,
    );
    const friend = await joinStudentRoom(
      browser,
      fixture.students[1],
      "mystery-box",
      host.code,
      transport,
    );
    sessions.push(host, friend);

    await host.page.getByRole("button", { name: /게임 시작/ }).click();
    await host.page.getByRole("button", { name: "미스터리 상자 시작" }).click();
    await host.page.getByLabel("예 또는 아니오 질문").fill("동물인가요?");
    await host.page.getByRole("button", { name: "질문 보내기" }).click();
    await expect(friend.page.getByText("동물인가요?", { exact: true })).toBeVisible();

    await friend.context.close();
    sessions.splice(sessions.indexOf(friend), 1);
    const reconnected = await joinStudentRoom(
      browser,
      fixture.students[1],
      "mystery-box",
      host.code,
      transport,
    );
    sessions.push(reconnected);
    await expect(
      reconnected.page.getByText("동물인가요?", { exact: true }),
    ).toBeVisible();
    await expect(
      reconnected.page.getByText("내 차례예요", { exact: true }),
    ).toBeVisible();
  } finally {
    await closeQuestionGameSessions(sessions);
    await transport.dispose();
  }
});

test("짝 찾기 실패 뒤 다음 참가자가 카드를 뒤집는다", async ({ browser }) => {
  const fixture = createQuestionGameBrowserFixture("memory-turn");
  const transport = createSharedQuestionGameTransport();
  const sessions: QuestionGameBrowserSession[] = [];

  try {
    const host = await openStudentRoom(
      browser,
      fixture.students[0],
      "memory",
      transport,
    );
    const friend = await joinStudentRoom(
      browser,
      fixture.students[1],
      "memory",
      host.code,
      transport,
    );
    sessions.push(host, friend);

    await host.page.getByRole("button", { name: /게임 시작/ }).click();
    await host.page.getByRole("button", { name: /쉬움/ }).click();
    await expect(
      host.page.getByRole("button", { name: /주사위 굴리기/ }),
    ).toBeVisible();
    await host.page.getByRole("button", { name: /주사위 굴리기/ }).click();
    await expect.poll(() => {
      const diceRolls = transport.getRoom(host.code)?.gameState.diceRolls as
        | Record<string, unknown>
        | undefined;
      return diceRolls?.[host.identity.id];
    }).toBe(2);
    await expect(friend.page.getByText("1/2", { exact: true })).toBeVisible();
    const friendRoll = friend.page.getByRole("button", {
      name: /주사위 굴리기/,
    });
    await expect(friendRoll).toBeEnabled();
    await friendRoll.click();
    await expect.poll(() => transport.getRoom(host.code)?.gameState.phase).toBe(
      "play",
    );
    expect(
      (transport.getRoom(host.code)?.gameState.turnOrder as string[] | undefined)?.[0],
    ).toBe(host.identity.id);

    const firstQuestion = host.page.getByRole("button", { name: "질문 카드 1" });
    await expect(firstQuestion).toBeEnabled({ timeout: 10_000 });
    await firstQuestion.click();
    await expect.poll(() => {
      const state = transport.getRoom(host.code)?.gameState;
      return Array.isArray(state?.revealedIds) ? state.revealedIds.length : 0;
    }).toBe(1);

    const state = transport.getRoom(host.code)?.gameState as {
      qCards?: Array<{ pairId: string }>;
      aCards?: Array<{ pairId: string }>;
    } | undefined;
    const questionPairId = state?.qCards?.[0]?.pairId;
    const wrongAnswerIndex = state?.aCards?.findIndex(
      ({ pairId }) => pairId !== questionPairId,
    ) ?? -1;
    expect(wrongAnswerIndex).toBeGreaterThanOrEqual(0);
    await host.page.getByRole("button", {
      name: `대답 카드 ${wrongAnswerIndex + 1}`,
    }).click();

    await expect.poll(() => {
      const snapshot = transport.getRoom(host.code)?.gameState;
      return typeof snapshot?.currentTurnIdx === "number"
        ? snapshot.currentTurnIdx
        : -1;
    }).toBe(1);
    await expect(friend.page.getByText("내 차례", { exact: true })).toBeVisible();
    await expect(
      friend.page.getByRole("button", { name: "질문 카드 1" }),
    ).toBeEnabled();
    await friend.page.getByRole("button", { name: "질문 카드 1" }).click();
    await expect.poll(() => {
      const snapshot = transport.getRoom(host.code)?.gameState;
      return {
        currentTurnIdx: snapshot?.currentTurnIdx,
        revealedCount: Array.isArray(snapshot?.revealedIds)
          ? snapshot.revealedIds.length
          : 0,
      };
    }).toEqual({ currentTurnIdx: 1, revealedCount: 1 });
    const revealedQuestion = /^질문 카드:/;
    const hostRevealed = host.page.getByRole("button", {
      name: revealedQuestion,
    });
    const friendRevealed = friend.page.getByRole("button", {
      name: revealedQuestion,
    });
    await expect(hostRevealed).toHaveCount(1);
    await expect(hostRevealed).toBeVisible();
    await expect(friendRevealed).toHaveCount(1);
    await expect(friendRevealed).toBeVisible();
  } finally {
    await closeQuestionGameSessions(sessions);
    await transport.dispose();
  }
});

test("사다리 실제 경로를 따라 세 라운드 뒤 자동 종료한다", async ({ browser }) => {
  test.slow();
  const fixture = createQuestionGameBrowserFixture("ladder-rounds");
  const transport = createSharedQuestionGameTransport();
  const sessions: QuestionGameBrowserSession[] = [];

  try {
    const host = await openStudentRoom(
      browser,
      fixture.students[0],
      "ladder",
      transport,
    );
    const friend = await joinStudentRoom(
      browser,
      fixture.students[1],
      "ladder",
      host.code,
      transport,
      { theme: "dark" },
    );
    sessions.push(host, friend);

    await host.page.getByRole("button", { name: /게임 시작/ }).click();
    await host.page.getByLabel("질문 주제 1").fill("우주");
    await host.page.getByLabel("질문 주제 2").fill("바다");
    await host.page.getByRole("button", { name: "사다리 준비" }).click();

    const roundLabels = [
      "첫째 라운드 / 셋째 라운드",
      "둘째 라운드 / 셋째 라운드",
      "셋째 라운드 / 셋째 라운드",
    ];
    for (let round = 1; round <= 3; round += 1) {
      const label = roundLabels[round - 1];
      await expect(host.page.getByText(label, { exact: true }).first()).toBeVisible();
      await expect(friend.page.getByText(label, { exact: true }).first()).toBeVisible();
      await expectLadderPathGeometry(host.page);
      await expectLadderPathGeometry(friend.page);
      await expectSvgStrokeContrast(
        host.page.getByTestId("ladder-path-segment"),
      );
      await expectSvgStrokeContrast(
        friend.page.getByTestId("ladder-path-segment"),
      );

      await submitLadderQuestion(
        host.page,
        `이 주제는 우리 생활과 ${round}번째로 어떻게 이어질까요?`,
      );
      await expect(friend.page.getByText("1 / 2", { exact: true })).toBeVisible();
      await submitLadderQuestion(
        friend.page,
        `이 주제를 더 깊이 이해하려면 ${round}번째로 무엇을 살펴볼까요?`,
      );
    }

    await expect(host.page.getByText("질문 사다리 완성", { exact: true })).toBeVisible();
    await expect(friend.page.getByText("질문 사다리 완성", { exact: true })).toBeVisible();
    await expect(host.page.getByRole("heading", { name: "나의 질문학습 결과" })).toBeVisible();
    await expect(friend.page.getByRole("heading", { name: "나의 질문학습 결과" })).toBeVisible();
    await expect(friend.page.getByText("친구와 함께", { exact: true })).toBeVisible();
    await expect.poll(() => transport.awardedPointsFor(host.identity.id)).toBeGreaterThan(0);
    await expect.poll(() => transport.awardedPointsFor(friend.identity.id)).toBeGreaterThan(0);
    await expect(
      host.page.getByText("받은 포인트", { exact: true }).locator(".."),
    ).toContainText(String(transport.awardedPointsFor(host.identity.id)));
    await expect(
      friend.page.getByText("받은 포인트", { exact: true }).locator(".."),
    ).toContainText(String(transport.awardedPointsFor(friend.identity.id)));
    const pointsBeforeRetry = transport.awardedPointsFor(host.identity.id);
    const endedRoom = transport.getRoom(host.code)!;
    const retryStatus = await host.page.evaluate(async (identity) => {
      const response = await fetch("/api/points/award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identity),
      });
      return response.status;
    }, {
      gameId: endedRoom.gameId,
      roomCode: endedRoom.code,
      roomCreatedAt: endedRoom.createdAt,
      playId: endedRoom.playId,
    });
    expect(retryStatus).toBe(200);
    expect(transport.awardedPointsFor(host.identity.id)).toBe(pointsBeforeRetry);
    expect(
      transport.awardRequestsFor(host.identity.id) +
      transport.awardRequestsFor(friend.identity.id),
    ).toBeGreaterThanOrEqual(2);
    await expectNoHorizontalPageOverflow(host.page);
    await expectNoHorizontalPageOverflow(friend.page);
    await expect.poll(() => transport.getRoom(host.code)?.status).toBe("ended");
    expect(transport.getRoom(host.code)?.gameState).toMatchObject({
      phase: "done",
      round: 3,
      endReason: "completed",
    });
  } finally {
    await closeQuestionGameSessions(sessions);
    await transport.dispose();
  }
});

test("화면 대비와 가로 넘침을 밝고 어두운 화면에서 지킨다", async ({ browser }) => {
  test.slow();
  const transport = createSharedQuestionGameTransport();
  const sessions: QuestionGameBrowserSession[] = [];
  const mobileRelayCases = [
    { theme: "light" as const, viewport: { width: 390, height: 844 } },
    { theme: "dark" as const, viewport: { width: 390, height: 844 } },
  ];
  const desktopLobbyCases = [
    { theme: "light" as const, viewport: { width: 1280, height: 800 } },
    { theme: "dark" as const, viewport: { width: 1280, height: 800 } },
  ];

  try {
    for (const theme of ["light", "dark"] as const) {
      const fixture = createQuestionGameBrowserFixture(
        `preparation-contrast-${theme}`,
      );
      const session = await openQuestionGameContext(
        browser,
        fixture.students[0],
        transport,
        { theme, viewport: { width: 390, height: 844 } },
      );
      sessions.push(session);

      for (const game of QUESTION_GAME_PREPARATION_CASES) {
        await session.page.goto(`/student-question-play/${game.id}`);
        await expect(
          session.page.getByRole("heading", { name: game.title, exact: true }),
        ).toBeVisible();
        await expect.poll(() => session.page.evaluate(() =>
          document.documentElement.classList.contains("dark")
        )).toBe(theme === "dark");

        const modeTitle = session.page.getByRole("heading", {
          name: "어떻게 놀이할까요?",
          exact: true,
        });
        const modeButtons = session.page
          .getByTestId("question-game-mode-options")
          .getByRole("button");
        await expect(modeButtons).toHaveCount(3);
        await expectTextContrast(modeTitle);

        for (let index = 0; index < 3; index += 1) {
          const modeButton = modeButtons.nth(index);
          await modeButton.click();
          await expectTextContrast(modeButton.locator("span").nth(1));
          await expectTextContrast(modeButton.locator("span").nth(2));
        }

        await modeButtons.nth(1).click();
        await expectTextContrast(session.page.getByText(
          "방을 만들거나 방 코드로 참가해서 같이 놀아요!",
          { exact: true },
        ));
        await modeButtons.nth(2).click();
        await expectTextContrast(session.page.getByText(
          "선생님이 설정한 Gemini 모델이 함께 놀아요",
          { exact: true },
        ));

        if (game.id === "relay") {
          await modeButtons.nth(0).click();
          await session.page.getByRole("button", { name: /시작하기/ }).click();
          await session.page.getByPlaceholder(/직접 입력하기/).fill("별");
          await session.page.getByRole("button", {
            name: /질문 릴레이 시작/,
          }).click();
          await session.page.locator("textarea").fill("별은 밝다");
          await session.page.getByRole("button", { name: /질문 연결/ }).click();
          await expectTextContrast(session.page.getByRole("alert").filter({
            hasText: "질문 형태로 써야 해요!",
          }));
        }
        await expectNoHorizontalPageOverflow(session.page);
      }
    }

    for (const [index, options] of mobileRelayCases.entries()) {
      const fixture = createQuestionGameBrowserFixture(`relay-contrast-${index}`);
      const host = await openStudentRoom(
        browser,
        fixture.students[0],
        "relay",
        transport,
        options,
      );
      const friend = await joinStudentRoom(
        browser,
        fixture.students[1],
        "relay",
        host.code,
        transport,
        options,
      );
      sessions.push(host, friend);
      await host.page.getByRole("button", { name: /게임 시작/ }).click();
      await host.page.getByLabel("릴레이 주제").fill("우주");
      await host.page.getByRole("button", { name: "릴레이 시작하기" }).click();
      const sharedQuestion = "우주는 왜 넓게 보일까요?";
      await host.page.getByLabel("앞 질문에 이어질 질문").fill(sharedQuestion);
      await host.page.getByRole("button", { name: "질문 보내기" }).click();

      const sharedRecord = friend.page.locator("li")
        .filter({ hasText: sharedQuestion });
      await expect(sharedRecord).toBeVisible();
      await expect.poll(() => friend.page.evaluate(() =>
        document.documentElement.classList.contains("dark")
      )).toBe(options.theme === "dark");
      await expectTextContrast(sharedRecord.locator("p").nth(0));
      await expectTextContrast(sharedRecord.locator("p").nth(1));
      await expectNoBoxOverlap([
        sharedRecord,
        friend.page.getByLabel("앞 질문에 이어질 질문"),
        friend.page.getByRole("button", { name: "질문 보내기" }),
      ]);
      await expectNoHorizontalPageOverflow(friend.page);
    }

    for (const [index, options] of desktopLobbyCases.entries()) {
      const fixture = createQuestionGameBrowserFixture(`lobby-contrast-${index}`);
      const room = await openStudentRoom(
        browser,
        fixture.students[0],
        "mystery-box",
        transport,
        options,
      );
      sessions.push(room);
      await expect.poll(() => room.page.evaluate(() =>
        document.documentElement.classList.contains("dark")
      )).toBe(options.theme === "dark");

      await expectTextContrast(room.page.getByText("방 코드", { exact: true }));
      await expectTextContrast(
        room.page.getByRole("button", { name: /코드 복사하기/ }),
      );
      await expectTextContrast(
        room.page.getByText("친구에게 이 코드를 알려주세요!", { exact: true }),
      );
      await expectTextContrast(
        room.page.getByText("친구를 기다리는 중...", { exact: true }),
      );
      await expectTextContrast(room.page.getByText("최대 8명", { exact: true }));
      const roomCodeCard = room.page.getByText("방 코드", { exact: true })
        .locator("..");
      const playerCard = room.page.getByRole("heading", { name: /참가자 1/ })
        .locator("../..");
      const startButton = room.page.getByRole("button", { name: /게임 시작/ });
      await expectNoBoxOverlap([roomCodeCard, playerCard, startButton]);
      await expectNoHorizontalPageOverflow(room.page);

      const joinPage = await openStudentJoinPage(
        browser,
        fixture.students[1],
        "mystery-box",
        transport,
        options,
      );
      sessions.push(joinPage);
      await submitQuestionGameRoomCode(joinPage.page, "0000");
      const joinError = joinPage.page.getByRole("alert").filter({
        hasText: "방을 찾을 수 없습니다",
      });
      await expect(joinError).toBeVisible();
      await expectTextContrast(joinError);
      await submitQuestionGameRoomCode(joinPage.page, room.code);
      const waitingForHost = joinPage.page.getByText(
        "방장이 시작하기를 기다리는 중...",
        { exact: true },
      );
      await expect(waitingForHost).toBeVisible();
      await expectLoadingRingContrast(
        waitingForHost.locator("..").locator("span.animate-spin"),
      );
    }
  } finally {
    await closeQuestionGameSessions(sessions);
    await transport.dispose();
  }
});
