import { describe, expect, it } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";
import {
  buildQuestionGameScoreEvidence,
  QuestionGameScoreEvidenceError,
} from "@/lib/question-game-score-evidence";
import { getKabaSentencePairs } from "@/lib/question-game-i18n";
import {
  assignLadderTopics,
  generateLadderGrid,
} from "@/lib/question-ladder";
import {
  STORY_DICE_FALLBACK,
  STORY_DICE_FALLBACK_EN,
  type DiceCategory,
} from "@/lib/story-dice-data";

const PLAY_ID = "10000000-0000-4000-8000-000000000001";
const ROUND_IDS = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
] as const;

const PLAYERS = [
  { id: "host", name: "교사", isHost: true, joinedAt: 1 },
  { id: "s1", name: "학생 하나", isHost: false, joinedAt: 2 },
];
const DEPARTED_PLAYER = {
  id: "left",
  name: "먼저 나간 학생",
  isHost: false,
  joinedAt: 3,
};

function completedRoom(
  gameId: GameRoom["gameId"],
  gameState: Record<string, unknown>,
  players = PLAYERS,
): GameRoom {
  return {
    code: "1234",
    gameId,
    hostId: "host",
    status: "ended",
    players,
    topic: gameId === "relay" ? "우주" : "",
    chain: [],
    turnIndex: 0,
    gameState,
    version: 20,
    createdAt: 10,
    updatedAt: 20,
    playId: PLAY_ID,
    pointAwardKeyVersion: 2,
    pointEvidenceVersion: 2,
  };
}

function makeMemoryRoom(scores = { host: 0, s1: 1 }): GameRoom {
  const pairs = Array.from({ length: 6 }, (_, index) => ({
    id: `pair-${index}`,
    question: `질문 ${index + 1}?`,
    answer: `대답 ${index + 1}`,
  }));
  const qCards = pairs.map(({ id }, index) => ({
    id: `q-${index}`,
    pairId: id,
    type: "q" as const,
  }));
  const aCards = pairs.map(({ id }, index) => ({
    id: `a-${index}`,
    pairId: id,
    type: "a" as const,
  }));
  const pairCount = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const takenIds = pairs.slice(0, pairCount).flatMap((_, index) => [
    qCards[index].id,
    aCards[index].id,
  ]);
  const takenSet = new Set(takenIds);

  return completedRoom("memory", {
    stateVersion: 2,
    game: "memory",
    phase: "done",
    recentCommandIds: [],
    roundId: ROUND_IDS[0],
    endReason: "completed",
    difficulty: "easy",
    pairs,
    qCards,
    aCards,
    diceRolls: { host: 6, s1: 5 },
    turnOrder: ["host", "s1"],
    currentTurnIdx: 0,
    takenIds,
    revealedIds: [...qCards, ...aCards]
      .filter(({ id }) => !takenSet.has(id))
      .map(({ id }) => id),
    scores,
    attempts: 18,
    maxAttempts: 18,
    lastReveal: null,
    lastResolvedRevealId: "resolved-last-attempt",
  });
}

function makeStoryRoom(): GameRoom {
  const categories: DiceCategory[] = ["protagonist", "place", "event"];
  const words = Object.fromEntries(categories.map((category) => [
    category,
    [...STORY_DICE_FALLBACK[category].slice(0, 8)],
  ])) as Record<DiceCategory, string[]>;
  const wordText = Object.fromEntries(categories.flatMap((category) =>
    words[category].map((word, index) => [word, {
      ko: word,
      en: STORY_DICE_FALLBACK_EN[category][index],
    }]),
  ));

  return completedRoom("story-dice", {
    stateVersion: 2,
    game: "story-dice",
    phase: "done",
    recentCommandIds: [],
    roundId: ROUND_IDS[1],
    round: 2,
    maxRounds: 2,
    completedRounds: 2,
    endReason: "completed",
    players: PLAYERS.map(({ id, name }) => ({ id, name })),
    playerNames: { host: "교사", s1: "학생 하나" },
    taggerId: "host",
    words: { ...words, wordText },
    rolledWords: {
      protagonist: words.protagonist[0],
      place: words.place[0],
      event: words.event[0],
    },
    roundPlayerIds: ["host", "s1"],
    roundTargetPlayerIds: ["s1"],
    roundSubmittedPlayerIds: ["s1"],
    turnOrder: ["s1"],
    currentTurnIdx: 0,
    story: {
      roundId: ROUND_IDS[0],
      round: 1,
      playerId: "host",
      playerName: "교사",
      story: "로봇이 학교에서 보물상자를 찾았어요.",
    },
    pendingQuestion: null,
    pairs: [1, 2].map((round) => ({
      roundId: ROUND_IDS[round - 1],
      round,
      playerId: "s1",
      playerName: "학생 하나",
      locale: "ko",
      question: `보물상자는 왜 그곳에 있었을까요 ${round}?`,
      taggerId: "host",
      taggerName: "교사",
      answer: `이야기 대답 ${round}`,
    })),
  });
}

type RoundGameId = "dice" | "relay";

function makeQuestionRoundRoom(gameId: RoundGameId): GameRoom {
  const questions = ROUND_IDS.flatMap((roundId, roundIndex) =>
    PLAYERS.map(({ id, name }, playerIndex) => ({
      roundId,
      round: roundIndex + 1,
      playerId: id,
      playerName: name,
      locale: "ko" as const,
      question: `${gameId} ${roundIndex + 1}-${playerIndex + 1} 질문은 무엇인가요?`,
      ...(gameId === "dice" ? { face: roundIndex + 1 } : {}),
    })),
  );
  return completedRoom(gameId, {
    stateVersion: 2,
    game: gameId,
    phase: "done",
    recentCommandIds: [],
    roundId: ROUND_IDS[2],
    round: 3,
    maxRounds: 3,
    completedRounds: 3,
    endReason: "completed",
    players: PLAYERS.map(({ id, name }) => ({ id, name })),
    playerNames: { host: "교사", s1: "학생 하나" },
    roundPlayerIds: ["host", "s1"],
    roundTargetPlayerIds: ["host", "s1"],
    roundSubmittedPlayerIds: ["host", "s1"],
    turnOrder: ["host", "s1"],
    currentTurnIdx: 0,
    questions,
    ...(gameId === "dice" ? { currentFace: null } : { topic: "우주" }),
  });
}

function makeLadderRoom(): GameRoom {
  const topics = ["우주", "바다"];
  const grid = generateLadderGrid(2, () => 0.9);
  const assigned = assignLadderTopics(topics, grid);
  const assignments = PLAYERS.map(({ id, name }, index) => ({
    playerId: id,
    playerName: name,
    ...assigned[index],
  }));
  const questions = ROUND_IDS.flatMap((roundId, roundIndex) =>
    assignments.map((assignment, playerIndex) => ({
      roundId,
      round: roundIndex + 1,
      playerId: assignment.playerId,
      playerName: assignment.playerName,
      topic: roundIndex === 2 ? assignment.topic : `지난 주제 ${roundIndex + 1}`,
      question: `사다리 ${roundIndex + 1}-${playerIndex + 1} 질문은 무엇인가요?`,
      locale: "ko" as const,
    })),
  );

  return completedRoom("ladder", {
    stateVersion: 2,
    game: "ladder",
    phase: "done",
    recentCommandIds: [],
    roundId: ROUND_IDS[2],
    round: 3,
    maxRounds: 3,
    endReason: "completed",
    topicPool: topics,
    roundTopics: topics,
    grid,
    roundPlayerIds: ["host", "s1"],
    roundTargetPlayerIds: ["host", "s1"],
    assignments,
    questions,
  });
}

function makeMysteryRoom(): GameRoom {
  return completedRoom("mystery-box", {
    stateVersion: 2,
    game: "mystery-box",
    phase: "done",
    recentCommandIds: [],
    roundId: ROUND_IDS[2],
    round: 3,
    maxRounds: 20,
    turnOrder: ["host", "s1"],
    currentTurnIdx: 0,
    history: [
      {
        kind: "question",
        playerId: "host",
        playerName: "교사",
        locale: "ko",
        question: "먹을 수 있나요?",
        answer: "yes",
      },
      {
        kind: "question",
        playerId: "s1",
        playerName: "학생 하나",
        locale: "ko",
        question: "둥근 모양인가요?",
        answer: "yes",
      },
      {
        kind: "guess",
        playerId: "host",
        playerName: "교사",
        locale: "en",
        guess: "apple",
        correct: true,
      },
    ],
    scores: { host: 1, s1: 1 },
    winnerId: "host",
    answer: { ko: "사과", en: "apple" },
    private: { itemId: "apple" },
    endReason: "completed",
  });
}

function makeKabaRoom(correct: Record<"host" | "s1", number> = { host: 1, s1: 2 }): GameRoom {
  const sentencePlan = getKabaSentencePairs().slice(0, 6);
  const used = { host: 0, s1: 0 };
  const attempts = sentencePlan.map((sentence, index) => {
    const player = PLAYERS[index % PLAYERS.length];
    used[player.id as "host" | "s1"] += 1;
    const isCorrect = used[player.id as "host" | "s1"] <= correct[player.id as "host" | "s1"];
    return {
      roundId: ROUND_IDS[Math.floor(index / 2)],
      round: Math.floor(index / 2) + 1,
      playerId: player.id,
      playerName: player.name,
      sentenceKey: sentence.key,
      sentence: sentence.text,
      locale: "ko",
      question: isCorrect ? `${index + 1}번째 문장인가요?` : `${index + 1}번째 문장입니다`,
      correct: isCorrect,
    };
  });
  return completedRoom("kaba", {
    stateVersion: 2,
    game: "kaba",
    phase: "done",
    recentCommandIds: [],
    roundId: ROUND_IDS[2],
    round: 3,
    maxRounds: 3,
    completedRounds: 3,
    endReason: "completed",
    players: PLAYERS.map(({ id, name }) => ({ id, name })),
    playerNames: { host: "교사", s1: "학생 하나" },
    sentencePlan,
    roundPlayerIds: ["host", "s1"],
    roundTargetPlayerIds: ["host", "s1"],
    roundSubmittedPlayerIds: ["host", "s1"],
    turnOrder: ["host", "s1"],
    currentTurnIdx: 0,
    attempts,
    scores: correct,
  });
}

describe("질문놀이 버전 2 점수 근거", () => {
  it.each([
    ["story-dice", makeStoryRoom, 2],
    ["dice", () => makeQuestionRoundRoom("dice"), 3],
    ["relay", () => makeQuestionRoundRoom("relay"), 3],
    ["ladder", makeLadderRoom, 3],
    ["mystery-box", makeMysteryRoom, 1],
    ["kaba", makeKabaRoom, 2],
  ] as const)("%s의 엄격한 완료 상태에서 학생 질문을 만든다", (_gameId, makeRoom, count) => {
    const [evidence] = buildQuestionGameScoreEvidence(
      makeRoom(),
      new Set(["s1"]),
    );

    expect(evidence).toMatchObject({
      studentId: "s1",
      studentName: "학생 하나",
      validQuestions: count,
      activityScore: count,
    });
    expect(evidence.questions).toHaveLength(count);
  });

  it("질문 사다리의 서로 다른 세 라운드 질문을 모두 근거로 센다", () => {
    const [evidence] = buildQuestionGameScoreEvidence(
      makeLadderRoom(),
      new Set(["s1"]),
    );

    expect(evidence.validQuestions).toBe(3);
    expect(evidence.questions).toEqual([
      "사다리 1-2 질문은 무엇인가요?",
      "사다리 2-2 질문은 무엇인가요?",
      "사다리 3-2 질문은 무엇인가요?",
    ]);
  });

  it("짝 찾기는 획득 짝만 활동 점수로 쓰고 질문 수는 영으로 둔다", () => {
    const [evidence] = buildQuestionGameScoreEvidence(
      makeMemoryRoom(),
      new Set(["s1"]),
    );

    expect(evidence).toEqual({
      studentId: "s1",
      studentName: "학생 하나",
      validQuestions: 0,
      activityScore: 1,
      questions: [],
      isWinner: true,
    });
  });

  it("이야기와 추측 및 틀린 까바 답안은 학생 질문에서 제외한다", () => {
    const story = buildQuestionGameScoreEvidence(
      makeStoryRoom(),
      new Set(["host", "s1"]),
    );
    const mystery = buildQuestionGameScoreEvidence(
      makeMysteryRoom(),
      new Set(["host", "s1"]),
    );
    const kaba = buildQuestionGameScoreEvidence(
      makeKabaRoom({ host: 0, s1: 1 }),
      new Set(["s1"]),
    );

    expect(story.find(({ studentId }) => studentId === "host")?.questions).toEqual([]);
    expect(story.find(({ studentId }) => studentId === "s1")?.questions).not.toContain(
      "이야기 대답 1",
    );
    expect(mystery.find(({ studentId }) => studentId === "host")?.questions).toEqual([
      "먹을 수 있나요?",
    ]);
    expect(kaba[0].questions).toEqual(["2번째 문장인가요?"]);
  });

  it("담당 학생만 결과에 넣고 담당 학생의 영점수도 보존한다", () => {
    const evidence = buildQuestionGameScoreEvidence(
      makeKabaRoom({ host: 0, s1: 0 }),
      new Set(["s1", "not-in-room"]),
    );

    expect(evidence).toEqual([{
      studentId: "s1",
      studentName: "학생 하나",
      validQuestions: 0,
      activityScore: 0,
      questions: [],
      isWinner: false,
    }]);
  });

  it("완료 뒤 떠난 학생도 완료 순간 참가자 기록으로 점수 근거를 만든다", () => {
    const completed = makeQuestionRoundRoom("dice");
    const room: GameRoom = {
      ...completed,
      pointParticipants: structuredClone(completed.players),
      players: [completed.players[0]],
    };

    const evidence = buildQuestionGameScoreEvidence(
      room,
      new Set(["s1"]),
    );

    expect(evidence).toEqual([
      expect.objectContaining({
        studentId: "s1",
        studentName: "학생 하나",
        validQuestions: 3,
        activityScore: 3,
      }),
    ]);
  });

  it("라운드 놀이는 완료 전 떠난 학생의 예전 질문을 무시하고 완료 참가자만 계산한다", () => {
    const completed = makeQuestionRoundRoom("relay");
    const gameState = completed.gameState as {
      players: Array<{ id: string; name: string }>;
      playerNames: Record<string, string>;
      questions: Array<Record<string, unknown>>;
    };
    const room: GameRoom = {
      ...completed,
      pointParticipants: structuredClone(PLAYERS),
      gameState: {
        ...completed.gameState,
        players: [
          ...gameState.players,
          { id: DEPARTED_PLAYER.id, name: DEPARTED_PLAYER.name },
        ],
        playerNames: {
          ...gameState.playerNames,
          [DEPARTED_PLAYER.id]: DEPARTED_PLAYER.name,
        },
        questions: [
          ...gameState.questions,
          {
            roundId: ROUND_IDS[0],
            round: 1,
            playerId: DEPARTED_PLAYER.id,
            playerName: DEPARTED_PLAYER.name,
            locale: "ko",
            question: "떠나기 전에 작성한 질문은 무엇인가요?",
          },
        ],
      },
    };

    const evidence = buildQuestionGameScoreEvidence(
      room,
      new Set(["s1", DEPARTED_PLAYER.id]),
    );

    expect(evidence).toEqual([
      expect.objectContaining({
        studentId: "s1",
        validQuestions: 3,
        activityScore: 3,
      }),
    ]);
  });

  it("미스터리 박스는 완료 전 떠난 학생의 예전 활동으로 남은 학생 점수를 막지 않는다", () => {
    const completed = makeMysteryRoom();
    const history = completed.gameState.history as Array<Record<string, unknown>>;
    const room: GameRoom = {
      ...completed,
      pointParticipants: structuredClone(PLAYERS),
      gameState: {
        ...completed.gameState,
        round: 4,
        history: [
          {
            kind: "question",
            playerId: DEPARTED_PLAYER.id,
            playerName: DEPARTED_PLAYER.name,
            locale: "ko",
            question: "먹을 수 있나요?",
            answer: "yes",
          },
          ...history,
        ],
      },
    };

    const evidence = buildQuestionGameScoreEvidence(
      room,
      new Set(["s1", DEPARTED_PLAYER.id]),
    );

    expect(evidence).toEqual([
      expect.objectContaining({
        studentId: "s1",
        validQuestions: 1,
        activityScore: 1,
      }),
    ]);
  });

  it("현재 방장 식별값이 완료 순간 참가자 기록 밖이면 거절한다", () => {
    const completed = makeQuestionRoundRoom("dice");
    const room: GameRoom = {
      ...completed,
      hostId: "outside",
      pointParticipants: structuredClone(completed.players),
      players: [completed.players[0]],
    };

    expect(() => buildQuestionGameScoreEvidence(
      room,
      new Set(["s1"]),
    )).toThrow(/방장 참가자/);
  });

  it("경쟁 최고점은 담당 학생만이 아니라 교사를 포함한 방 전체에서 정한다", () => {
    const [student] = buildQuestionGameScoreEvidence(
      makeMemoryRoom({ host: 2, s1: 1 }),
      new Set(["s1"]),
    );

    expect(student.activityScore).toBe(1);
    expect(student.isWinner).toBe(false);
  });

  it("경쟁 놀이도 방 전체 최고점이 영이면 우승자를 만들지 않는다", () => {
    const [student] = buildQuestionGameScoreEvidence(
      makeKabaRoom({ host: 0, s1: 0 }),
      new Set(["s1"]),
    );

    expect(student.activityScore).toBe(0);
    expect(student.isWinner).toBe(false);
  });

  it("공통 규칙의 친구 방 참가 인원 범위를 벗어난 근거를 거절한다", () => {
    const room = makeMemoryRoom({ host: 0, s1: 0 });
    const onePlayerRoom: GameRoom = {
      ...room,
      players: [PLAYERS[0]],
      gameState: {
        ...room.gameState,
        diceRolls: { host: 6 },
        turnOrder: ["host"],
        scores: { host: 0 },
      },
    };

    expect(() => buildQuestionGameScoreEvidence(
      onePlayerRoom,
      new Set(["host"]),
    )).toThrow(/참가 인원/);
  });

  it.each([
    ["상태", (room: GameRoom) => ({ ...room, status: "playing" as const })],
    ["실행 식별값", (room: GameRoom) => ({ ...room, playId: undefined })],
    ["점수 근거 버전", (room: GameRoom) => ({ ...room, pointEvidenceVersion: 1 as const })],
    ["점수 키 버전", (room: GameRoom) => ({ ...room, pointAwardKeyVersion: 1 as const })],
    ["완료 사유", (room: GameRoom) => ({
      ...room,
      gameState: { ...room.gameState, endReason: "host" },
    })],
    ["상태 버전", (room: GameRoom) => ({
      ...room,
      gameState: { ...room.gameState, stateVersion: 1 },
    })],
  ])("완료된 버전 2 방의 %s가 맞지 않으면 명확히 거절한다", (_name, mutate) => {
    expect(() => buildQuestionGameScoreEvidence(
      mutate(makeQuestionRoundRoom("dice")),
      new Set(["s1"]),
    )).toThrow(QuestionGameScoreEvidenceError);
  });

  it("엄격 판독기에서 손상된 까바 점수와 참가자 불일치를 거절한다", () => {
    const room = makeKabaRoom();
    const badScore = {
      ...room,
      gameState: { ...room.gameState, scores: { host: 3, s1: 3 } },
    };
    const badPlayers = {
      ...makeQuestionRoundRoom("dice"),
      players: [{ ...PLAYERS[0] }, { ...PLAYERS[1], name: "다른 이름" }],
    };

    expect(() => buildQuestionGameScoreEvidence(badScore, new Set(["s1"])))
      .toThrow(/손상/);
    expect(() => buildQuestionGameScoreEvidence(badPlayers, new Set(["s1"])))
      .toThrow(/참가자/);
  });
});
