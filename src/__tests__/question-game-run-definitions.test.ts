import { describe, expect, it } from "vitest";
import { QuestionGameRunError } from "@/lib/question-game-run-definition";
import { findQuestionGameRunDefinition } from "@/lib/question-game-run-definitions";

const TOPIC_HASH = "a".repeat(64);

describe("질문놀이 실행 정의", () => {
  it("지원하는 놀이의 상태 처리기를 찾는다", () => {
    expect(findQuestionGameRunDefinition("relay")?.gameId).toBe("relay");
    expect(findQuestionGameRunDefinition("dice")?.gameId).toBe("dice");
    expect(findQuestionGameRunDefinition("not-supported")).toBeUndefined();
  });

  it("릴레이 초기 상태와 공개 진행 정보를 기존 형식으로 만든다", () => {
    const definition = findQuestionGameRunDefinition("relay");
    expect(definition).toBeDefined();
    if (!definition) return;

    const state = definition.createState({
      mode: "SOLO",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 5,
    });

    definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 1,
      activeRun: true,
    });
    expect(definition.publicProgress(state, "SOLO")).toEqual({
      questionCount: 0,
      aiTurnCount: 0,
      awaitingAiTurn: false,
      targetCount: 3,
    });
    expect(definition.result(state)).toBeUndefined();
  });

  it("진행 중인 릴레이를 정리할 때 임시 생성 자료만 없앤다", () => {
    const definition = findQuestionGameRunDefinition("relay");
    expect(definition).toBeDefined();
    if (!definition) return;

    const state = definition.parseState({
      game: "relay",
      topicHash: TOPIC_HASH,
      topicLength: 5,
      locale: "ko",
      questionCount: 1,
      aiTurnCount: 0,
      activitySequence: 1,
      nextActor: "AI",
      targetCount: 3,
      questionHashes: ["b".repeat(64)],
      aiGenerationLease: {
        id: "10000000-0000-4000-8000-000000000001",
        generationRequestId: "10000000-0000-4000-8000-000000000002",
        runVersion: 2,
        expiresAt: 2_000,
      },
    });

    const cleared = definition.clearTransientState(state);

    expect(cleared).toEqual({
      game: "relay",
      topicHash: TOPIC_HASH,
      topicLength: 5,
      locale: "ko",
      questionCount: 1,
      aiTurnCount: 0,
      activitySequence: 1,
      nextActor: "AI",
      targetCount: 3,
      questionHashes: ["b".repeat(64)],
    });
    expect(state).toHaveProperty("aiGenerationLease");
  });

  it("릴레이 순서가 맞지 않는 저장 상태를 거부한다", () => {
    const definition = findQuestionGameRunDefinition("relay");
    expect(definition).toBeDefined();
    if (!definition) return;

    const state = definition.parseState({
      game: "relay",
      topicHash: TOPIC_HASH,
      topicLength: 5,
      locale: "ko",
      questionCount: 1,
      aiTurnCount: 0,
      activitySequence: 1,
      nextActor: "STUDENT",
      targetCount: 3,
      questionHashes: ["b".repeat(64)],
    });

    expect(() => definition.ensureProgress(state, {
      mode: "AI",
      runVersion: 2,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
  });

  it("질문 주사위 초기 상태와 공개 차례를 만든다", () => {
    const definition = findQuestionGameRunDefinition("dice");
    expect(definition).toBeDefined();
    if (!definition) return;

    const state = definition.createState({
      mode: "AI",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 5,
    });

    definition.ensureProgress(state, {
      mode: "AI",
      runVersion: 1,
      activeRun: true,
    });
    expect(definition.publicProgress(state, "AI")).toEqual({
      questionCount: 0,
      aiTurnCount: 0,
      awaitingAiTurn: false,
      targetCount: 3,
      nextStep: "STUDENT_ROLL",
      pendingRoll: null,
    });
    expect(state).toEqual({
      game: "dice",
      locale: "ko",
      targetCount: 3,
      questionCount: 0,
      aiTurnCount: 0,
      activitySequence: 0,
      nextStep: "STUDENT_ROLL",
      questionHashes: [],
    });
  });

  it("질문 주사위의 굴리기와 질문 차례가 어긋난 상태를 거부한다", () => {
    const definition = findQuestionGameRunDefinition("dice");
    expect(definition).toBeDefined();
    if (!definition) return;

    const state = definition.parseState({
      game: "dice",
      locale: "ko",
      targetCount: 3,
      questionCount: 0,
      aiTurnCount: 0,
      activitySequence: 1,
      nextStep: "STUDENT_QUESTION",
      pendingRoll: { actor: "AI", face: 4 },
      questionHashes: [],
    });

    expect(() => definition.ensureProgress(state, {
      mode: "AI",
      runVersion: 2,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
  });
});
