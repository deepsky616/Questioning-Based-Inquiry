import { describe, expect, it } from "vitest";
import { parseGameRoom, type GameRoom } from "@/lib/question-games-data";
import { getKabaSentencePairs } from "@/lib/question-game-i18n";
import {
  applyQuestionGameRoomCommand,
  leaveQuestionGameRoom,
} from "@/lib/question-game-room-engine";
import {
  readDicePublicState,
  readKabaPublicState,
  readRelayPublicState,
  type DiceRoomState,
  type KabaRoomState,
  type RelayRoomState,
} from "@/lib/question-game-room-engines/turn-games";

function uuid(index: number): string {
  return `20000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function makePlayers(count: number): GameRoom["players"] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? "host" : `guest-${index}`,
    name: index === 0 ? "방장" : `친구 ${index}`,
    isHost: index === 0,
    joinedAt: index + 1,
  }));
}

function waiting(gameId: "dice" | "relay" | "kaba", count = 2): GameRoom {
  return {
    code: "5678",
    gameId,
    hostId: "host",
    status: "waiting",
    players: makePlayers(count),
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 3,
    createdAt: 30,
    updatedAt: 30,
  };
}

function changed(result: ReturnType<typeof applyQuestionGameRoomCommand>): GameRoom {
  expect(result.kind).toBe("changed");
  if (result.kind !== "changed") throw new Error("변경 결과가 필요합니다");
  return result.room;
}

function start(gameId: "dice" | "relay" | "kaba", count = 2): GameRoom {
  const values = [uuid(1), uuid(2)];
  return changed(applyQuestionGameRoomCommand({
    room: waiting(gameId, count),
    userId: "host",
    userName: "방장",
    action: "start",
    body: {
      commandId: uuid(10),
      expectedCreatedAt: 30,
      expectedVersion: 3,
    },
    now: 40,
    random: () => 0,
    randomUUID: () => values.shift() ?? uuid(99),
  }));
}

function run(
  room: GameRoom,
  userId: string,
  action: string,
  index: number,
  extra: Record<string, unknown> = {},
  options: { random?: () => number; randomUUID?: () => string } = {},
) {
  const user = room.players.find((player) => player.id === userId);
  return applyQuestionGameRoomCommand({
    room,
    userId,
    userName: user?.name ?? "요청 이름",
    action,
    body: {
      commandId: uuid(100 + index),
      expectedCreatedAt: room.createdAt,
      expectedVersion: room.version,
      playId: room.playId,
      ...(room.gameState.roundId ? { roundId: room.gameState.roundId } : {}),
      ...extra,
    },
    now: 100 + index,
    random: options.random ?? (() => 0),
    randomUUID: options.randomUUID ?? (() => uuid(500 + index)),
  });
}

function submitDiceTurn(room: GameRoom, index: number, nextRoundId = uuid(700 + index)): GameRoom {
  const state = readDicePublicState(room.gameState)!;
  const playerId = state.turnOrder[state.currentTurnIdx];
  let current = changed(run(room, playerId, "dice-roll", index, {}, { random: () => 0.999 }));
  current = changed(run(current, playerId, "dice-submit-question", index + 1, {
    locale: "ko",
    question: `이 생각은 왜 필요할까요 ${index}?`,
  }, { randomUUID: () => nextRoundId }));
  return current;
}

function setRelayTopic(count = 2): GameRoom {
  const room = start("relay", count);
  return changed(run(room, "host", "relay-set-topic", 1, { topic: "우주" }, {
    randomUUID: () => uuid(20),
  }));
}

function submitRelayTurn(room: GameRoom, index: number, nextRoundId = uuid(800 + index)): GameRoom {
  const state = readRelayPublicState(room.gameState)!;
  const playerId = state.turnOrder[state.currentTurnIdx];
  return changed(run(room, playerId, "relay-submit-question", index, {
    locale: "ko",
    question: `우주에서는 왜 별이 빛날까요 ${index}?`,
  }, { randomUUID: () => nextRoundId }));
}

function preparedKaba(count: number, random = () => 0): GameRoom {
  const room = start("kaba", count);
  return changed(run(room, "host", "kaba-prepare", 2, {}, {
    random,
    randomUUID: () => uuid(30),
  }));
}

function preparedKabaWithFirstSentence(sentence: string): GameRoom {
  const room = preparedKaba(2);
  const state = readKabaPublicState(room.gameState)!;
  const selectedSentence = getKabaSentencePairs().find(
    ({ text }) => text.ko === sentence,
  );
  if (!selectedSentence) throw new Error("missing kaba sentence");

  const selectedIndex = state.sentencePlan.findIndex(
    ({ text }) => text.ko === sentence,
  );
  const sentencePlan = [...state.sentencePlan];
  if (selectedIndex >= 0) {
    [sentencePlan[0], sentencePlan[selectedIndex]] = [
      sentencePlan[selectedIndex],
      sentencePlan[0],
    ];
  } else {
    sentencePlan[0] = selectedSentence;
  }
  return { ...room, gameState: { ...state, sentencePlan } };
}

function completedRoom(gameId: "dice" | "relay" | "kaba"): GameRoom {
  if (gameId === "dice") {
    let room = start("dice", 2);
    for (let turn = 0; turn < 6; turn += 1) {
      room = submitDiceTurn(room, 200 + turn * 2);
    }
    return room;
  }

  if (gameId === "relay") {
    let room = setRelayTopic();
    for (let turn = 0; turn < 6; turn += 1) {
      room = submitRelayTurn(room, 300 + turn);
    }
    return room;
  }

  let room = preparedKaba(2);
  for (let turn = 0; turn < 6; turn += 1) {
    const state = readKabaPublicState(room.gameState)!;
    const playerId = state.turnOrder[state.currentTurnIdx];
    room = changed(run(room, playerId, "kaba-submit-question", 400 + turn, {
      locale: "ko",
      question: `${turn + 1}번째 완료 문장인가요?`,
    }, { randomUUID: () => uuid(950 + turn) }));
  }
  return room;
}

describe("참여 인원별 공유 라운드", () => {
  it.each(["dice", "relay", "kaba"] as const)(
    "%s 놀이는 세 명까지 세 라운드, 네 명부터 두 라운드로 정한다",
    (gameId) => {
      expect(start(gameId, 3).gameState.maxRounds).toBe(3);
      expect(start(gameId, 4).gameState.maxRounds).toBe(2);
      expect(start(gameId, 8).gameState.maxRounds).toBe(2);
    },
  );
});

describe("질문 주사위 판정기", () => {
  it("내용이 없는 질문은 차례와 기록에 반영하지 않는다", () => {
    const room = start("dice", 2);
    const rolled = changed(run(room, "host", "dice-roll", 8));
    const result = run(rolled, "host", "dice-submit-question", 9, {
      locale: "ko",
      question: "그냥요?",
    });

    expect(result.kind).toBe("invalid");
    expect("message" in result ? result.message : undefined).toBe("주제에 맞는 궁금한 내용을 넣어 질문을 한 문장으로 써 주세요");
    expect(readDicePublicState(result.room.gameState)?.questions).toEqual([]);
  });

  it("서버가 면을 정하고 모두 한 번씩 하면 다음 라운드로 넘긴다", () => {
    let room = start("dice", 2);
    room = submitDiceTurn(room, 10);
    const rolled = changed(run(room, "guest-1", "dice-roll", 12, {}, { random: () => 0.999 }));
    expect((rolled.gameState as unknown as DiceRoomState).currentFace).toBe(6);
    room = changed(run(rolled, "guest-1", "dice-submit-question", 13, {
      locale: "ko",
      question: "서로 다른 생각은 왜 중요할까요?",
    }, { randomUUID: () => uuid(21) }));

    const state = readDicePublicState(room.gameState)!;
    expect(state.round).toBe(2);
    expect(state.roundId).toBe(uuid(21));
    expect(state.roundSubmittedPlayerIds).toEqual([]);
  });

  it("세 번째 라운드의 마지막 비방장 저장에서 바로 완료한다", () => {
    let room = start("dice", 2);
    for (let turn = 0; turn < 6; turn += 1) room = submitDiceTurn(room, 30 + turn * 2);

    expect(room.status).toBe("ended");
    expect(readDicePublicState(room.gameState)).toMatchObject({
      phase: "done",
      endReason: "completed",
      round: 3,
    });
  });

  it("차례 위반과 클라이언트 면 주입을 거절하고 재전송은 재생한다", () => {
    const room = start("dice", 2);
    expect(run(room, "guest-1", "dice-roll", 50).kind).toBe("forbidden");
    expect(run(room, "host", "dice-roll", 51, { face: 6 }).kind).toBe("invalid");

    const first = run(room, "host", "dice-roll", 52);
    const rolled = changed(first);
    expect(run(rolled, "host", "dice-roll", 52).kind).toBe("replayed");
    expect(run(rolled, "host", "dice-submit-question", 53, {
      roundId: uuid(999),
      locale: "ko",
      question: "왜 중요할까요?",
    }).kind).toBe("conflict");
  });

  it("굴린 참가자가 나가면 서버 면을 버리고 다음 참가자가 다시 굴린다", () => {
    let room = start("dice", 3);
    room = changed(run(room, "host", "dice-roll", 55, {}, { random: () => 0.8 }));
    room = changed(leaveQuestionGameRoom({
      room,
      userId: "host",
      random: () => 0,
      randomUUID: () => uuid(27),
    }));

    const state = readDicePublicState(room.gameState)!;
    expect(state.phase).toBe("roll");
    expect(state.currentFace).toBeNull();
    expect(state.turnOrder[state.currentTurnIdx]).toBe("guest-1");
  });
});

describe("질문 릴레이 판정기", () => {
  it("내용이 없는 질문은 질문 흐름에 추가하지 않는다", () => {
    const room = setRelayTopic();
    const result = run(room, "host", "relay-submit-question", 58, {
      locale: "ko",
      question: "왜요?",
    });

    expect(result.kind).toBe("invalid");
    expect("message" in result ? result.message : undefined).toBe("주제에 맞는 궁금한 내용을 넣어 질문을 한 문장으로 써 주세요");
    expect(readRelayPublicState(result.room.gameState)?.questions).toEqual([]);
  });

  it("라운드 필드가 없던 옛 방 체인도 계속 읽는다", () => {
    const oldRoom = waiting("relay", 2);
    oldRoom.chain = [{
      question: "우주는 왜 넓을까요?",
      playerId: "host",
      playerName: "방장",
    }];

    expect(parseGameRoom(oldRoom)?.chain).toEqual(oldRoom.chain);
  });

  it("권위 기록을 라운드 식별값이 있는 방 체인에 투영한다", () => {
    let room = setRelayTopic();
    room = submitRelayTurn(room, 60);
    const firstState = readRelayPublicState(room.gameState)!;

    expect(room.chain[0]).toMatchObject({
      question: firstState.questions[0].question,
      round: 1,
      roundId: firstState.questions[0].roundId,
    });
    room = submitRelayTurn(room, 61, uuid(22));
    expect((room.gameState as unknown as RelayRoomState).round).toBe(2);
  });

  it("자료 저장소가 체인 항목 속성 순서를 바꿔도 다음 친구가 질문을 잇는다", () => {
    let room = setRelayTopic();
    room = submitRelayTurn(room, 62);
    room = {
      ...room,
      chain: room.chain.map((item) => ({
        round: item.round,
        roundId: item.roundId,
        playerId: item.playerId,
        question: item.question,
        playerName: item.playerName,
      })),
    };
    const state = readRelayPublicState(room.gameState)!;
    const nextPlayerId = state.turnOrder[state.currentTurnIdx];

    expect(run(room, nextPlayerId, "relay-submit-question", 63, {
      locale: "ko",
      question: "별빛은 지구까지 얼마나 걸려서 올까요?",
    }).kind).toBe("changed");
  });

  it("체인 항목의 실제 값이 다르면 손상 상태로 계속 거절한다", () => {
    let room = setRelayTopic();
    room = submitRelayTurn(room, 64);
    room = {
      ...room,
      chain: room.chain.map((item) => ({ ...item, question: "바뀐 질문인가요?" })),
    };
    const state = readRelayPublicState(room.gameState)!;
    const nextPlayerId = state.turnOrder[state.currentTurnIdx];

    expect(run(room, nextPlayerId, "relay-submit-question", 65, {
      locale: "ko",
      question: "별은 모두 같은 색으로 보일까요?",
    }).kind).toBe("corrupt");
  });

  it("중복 질문과 비속어 질문을 기존 경계에서 거절한다", () => {
    let room = setRelayTopic();
    room = submitRelayTurn(room, 70);
    const state = readRelayPublicState(room.gameState)!;
    const next = state.turnOrder[state.currentTurnIdx];

    expect(run(room, next, "relay-submit-question", 71, {
      locale: "ko",
      question: state.questions[0].question,
    }).kind).toBe("invalid");
    expect(run(room, next, "relay-submit-question", 72, {
      locale: "ko",
      question: "씨발 왜 그럴까요?",
    }).kind).toBe("invalid");
  });

  it("현재 대상이 나가 순환이 채워지면 다음 라운드로 넘긴다", () => {
    let room = setRelayTopic(3);
    room = submitRelayTurn(room, 80);
    room = submitRelayTurn(room, 81);
    const current = readRelayPublicState(room.gameState)!;
    const leavingId = current.turnOrder[current.currentTurnIdx];

    const result = leaveQuestionGameRoom({
      room,
      userId: leavingId,
      random: () => 0,
      randomUUID: () => uuid(23),
    });
    room = changed(result);
    expect(readRelayPublicState(room.gameState)).toMatchObject({ round: 2, roundId: uuid(23) });
  });

  it("예전 라운드는 충돌시키고 같은 명령 재전송은 재생한다", () => {
    const room = setRelayTopic(3);
    const first = run(room, "host", "relay-submit-question", 85, {
      locale: "ko",
      question: "우주에는 왜 별이 많을까요?",
    });
    const saved = changed(first);
    expect(run(saved, "host", "relay-submit-question", 85, {
      locale: "ko",
      question: "우주에는 왜 별이 많을까요?",
    }).kind).toBe("replayed");
    expect(run(saved, "guest-1", "relay-submit-question", 86, {
      roundId: uuid(999),
      locale: "ko",
      question: "별은 왜 빛날까요?",
    }).kind).toBe("conflict");
  });

  it("세 번째 라운드 마지막 참가자 저장에서 자동 완료한다", () => {
    let room = setRelayTopic();
    for (let turn = 0; turn < 6; turn += 1) room = submitRelayTurn(room, 110 + turn);
    expect(room.status).toBe("ended");
    expect(readRelayPublicState(room.gameState)).toMatchObject({
      phase: "done",
      round: 3,
      endReason: "completed",
    });
  });
});

describe("카바 판정기", () => {
  it("내용이 없는 질문은 틀린 시도로도 기록하지 않는다", () => {
    const room = preparedKaba(2);
    const result = run(room, "host", "kaba-submit-question", 89, {
      locale: "ko",
      question: "아무거나요?",
    });

    expect(result).toMatchObject({
      kind: "invalid",
      room,
      message: "주제에 맞는 궁금한 내용을 넣어 질문을 한 문장으로 써 주세요",
    });
    expect(readKabaPublicState(result.room.gameState)?.attempts).toEqual([]);
  });

  it.each([[2, 6], [8, 16]])("참가자 %i명에게 겹치지 않는 문장 %i개를 서버가 배정한다", (count, total) => {
    const room = preparedKaba(count, () => 0.37);
    const state = readKabaPublicState(room.gameState)!;

    expect(state.sentencePlan).toHaveLength(total);
    expect(new Set(state.sentencePlan.map((entry) => entry.key)).size).toBe(total);
  });

  it("정답 여부를 서버가 계산하고 틀린 시도도 횟수에 넣는다", () => {
    let room = preparedKaba(2);
    room = changed(run(room, "host", "kaba-submit-question", 90, {
      locale: "ko",
      question: "질문이 아닙니다",
    }));
    let state = readKabaPublicState(room.gameState)!;
    expect(state.attempts[0].correct).toBe(false);

    room = changed(run(room, "guest-1", "kaba-submit-question", 91, {
      locale: "ko",
      question: "토끼가 뛰나요?",
    }, { randomUUID: () => uuid(24) }));
    state = readKabaPublicState(room.gameState)!;
    expect(state.attempts[1].correct).toBe(true);
    expect(state.round).toBe(2);
    expect(run(room, "host", "kaba-submit-question", 92, {
      locale: "ko",
      question: "고양이가 자나요?",
      correct: true,
    }).kind).toBe("invalid");
  });

  it("자연스러운 짧은 질문을 친구방에서도 정답으로 판정한다", () => {
    const matching = changed(run(
      preparedKabaWithFirstSentence("사과가 빨갛다"),
      "host",
      "kaba-submit-question",
      92,
      { locale: "ko", question: "사과가 빨갛니?" },
    ));

    expect(readKabaPublicState(matching.gameState)?.attempts[0]).toMatchObject({
      question: "사과가 빨갛니?",
      correct: true,
    });
  });

  it("원문과 다른 내용을 질문 꼴로만 바꾼 시도는 오답으로 판정한다", () => {
    const unrelated = changed(run(
      preparedKabaWithFirstSentence("개구리가 울다"),
      "host",
      "kaba-submit-question",
      93,
      { locale: "ko", question: "개구리가 노나요?" },
    ));
    const matching = changed(run(
      preparedKabaWithFirstSentence("개구리가 울다"),
      "host",
      "kaba-submit-question",
      94,
      { locale: "ko", question: "개구리가 우나요?" },
    ));

    expect(readKabaPublicState(unrelated.gameState)?.attempts[0].correct).toBe(false);
    expect(readKabaPublicState(matching.gameState)?.attempts[0].correct).toBe(true);
  });

  it("차례 위반과 예전 라운드를 막고 같은 명령은 재생한다", () => {
    const room = preparedKaba(2);
    expect(run(room, "guest-1", "kaba-submit-question", 95, {
      locale: "ko",
      question: "고양이가 자나요?",
    }).kind).toBe("forbidden");

    const first = run(room, "host", "kaba-submit-question", 96, {
      locale: "ko",
      question: "고양이가 자나요?",
    });
    const saved = changed(first);
    expect(run(saved, "host", "kaba-submit-question", 96, {
      locale: "ko",
      question: "고양이가 자나요?",
    }).kind).toBe("replayed");
    expect(run(saved, "guest-1", "kaba-submit-question", 97, {
      roundId: uuid(999),
      locale: "ko",
      question: "개미가 걷나요?",
    }).kind).toBe("conflict");
  });

  it("세 번째 라운드 마지막 시도에서 자동 완료한다", () => {
    let room = preparedKaba(2);
    for (let turn = 0; turn < 6; turn += 1) {
      const state = readKabaPublicState(room.gameState)!;
      const playerId = state.turnOrder[state.currentTurnIdx];
      room = changed(run(room, playerId, "kaba-submit-question", 120 + turn, {
        locale: "ko",
        question: `${turn + 1}번째 문장인가요?`,
      }, { randomUUID: () => uuid(900 + turn) }));
    }
    expect(room.status).toBe("ended");
    expect(readKabaPublicState(room.gameState)).toMatchObject({
      phase: "done",
      round: 3,
      endReason: "completed",
    });
  });

  it("세 명으로 시작한 뒤 준비 전에 한 명이 나가면 두 명용 문장 계획을 만든다", () => {
    let room = start("kaba", 3);
    room = changed(leaveQuestionGameRoom({ room, userId: "guest-2" }));
    room = changed(run(room, "host", "kaba-prepare", 150, {}, {
      random: () => 0.37,
      randomUUID: () => uuid(31),
    }));

    const state = readKabaPublicState(room.gameState)!;
    expect(state.players.map(({ id }) => id)).toEqual(["host", "guest-1"]);
    expect(Object.keys(state.scores).sort()).toEqual(["guest-1", "host"]);
    expect(state.sentencePlan).toHaveLength(6);
  });
});

describe("공유 라운드 공통 경계", () => {
  it.each(["dice", "relay", "kaba"] as const)(
    "%s 완료 뒤 일부와 마지막 참가자가 나가도 기록을 보존한 변경 결과를 낸다",
    (gameId) => {
      let room = completedRoom(gameId);
      const completedState = structuredClone(room.gameState);

      const firstLeave = leaveQuestionGameRoom({ room, userId: "host" });
      room = changed(firstLeave);
      expect(room.players.map(({ id }) => id)).toEqual(["guest-1"]);
      expect(room.gameState).toEqual(completedState);

      const lastLeave = leaveQuestionGameRoom({
        room,
        userId: "guest-1",
        pointAwardSettled: true,
      });
      room = changed(lastLeave);
      expect(room.players).toEqual([]);
      expect(room.gameState).toEqual(completedState);
    },
  );

  it("승인 장부 확인 없는 완료 방은 마지막 참가자 이탈로 실행 근거를 없애지 않는다", () => {
    let room = completedRoom("dice");
    room = changed(leaveQuestionGameRoom({ room, userId: "host" }));

    expect(leaveQuestionGameRoom({ room, userId: "guest-1" })).toMatchObject({
      kind: "conflict",
      room,
    });
  });

  it("완료 라운드가 하나 이상일 때만 방장이 조기 종료할 수 있다", () => {
    let room = setRelayTopic();
    expect(run(room, "host", "end-game-early", 100).kind).toBe("conflict");
    room = submitRelayTurn(room, 101);
    room = submitRelayTurn(room, 102, uuid(25));

    const nonHost = run(room, "guest-1", "end-game-early", 103);
    expect(nonHost.kind).toBe("forbidden");
    room = changed(run(room, "host", "end-game-early", 104));
    expect(room.status).toBe("ended");
    expect(readRelayPublicState(room.gameState)?.endReason).toBe("host");
  });

  it("엄격 공개 읽기가 완료 불충분, 진행 중 전체 제출, 이름 불일치를 거절한다", () => {
    const dice = readDicePublicState(start("dice", 2).gameState)!;
    expect(readDicePublicState({
      ...dice,
      phase: "done",
      endReason: "completed",
    })).toBeNull();
    expect(readDicePublicState({
      ...dice,
      roundSubmittedPlayerIds: [...dice.roundTargetPlayerIds],
    })).toBeNull();

    const oneSaved = submitDiceTurn(start("dice", 2), 138);
    const oneSavedState = readDicePublicState(oneSaved.gameState)!;
    expect(readDicePublicState({
      ...oneSavedState,
      roundSubmittedPlayerIds: [],
    })).toBeNull();

    const kaba = readKabaPublicState(preparedKaba(2).gameState)!;
    expect(readKabaPublicState({
      ...kaba,
      players: kaba.players.map((player, index) =>
        index === 0 ? { ...player, name: "위조 이름" } : player),
    })).toBeNull();

    let nextRound = start("dice", 2);
    nextRound = submitDiceTurn(nextRound, 140);
    nextRound = submitDiceTurn(nextRound, 142, uuid(28));
    const roundTwo = readDicePublicState(nextRound.gameState)!;
    expect(readDicePublicState({
      ...roundTwo,
      questions: roundTwo.questions.filter(({ playerId }) => playerId !== "guest-1"),
    })).toBeNull();
  });

  it("한 명만 남으면 다음 라운드보다 참가자 부족 종료를 먼저 적용한다", () => {
    const room = start("dice", 2);
    const left = leaveQuestionGameRoom({
      room,
      userId: "guest-1",
      random: () => 0,
      randomUUID: () => uuid(26),
    });
    const ended = changed(left);
    expect(ended.status).toBe("ended");
    expect(readDicePublicState(ended.gameState)?.endReason).toBe("insufficient-players");
  });
});
