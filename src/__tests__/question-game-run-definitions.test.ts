import { describe, expect, it } from "vitest";
import { QuestionGameRunError } from "@/lib/question-game-run-definition";
import { findQuestionGameRunDefinition } from "@/lib/question-game-run-definitions";

const TOPIC_HASH = "a".repeat(64);

describe("질문놀이 실행 정의", () => {
  it("지원하는 놀이의 상태 처리기를 찾는다", () => {
    expect(findQuestionGameRunDefinition("relay")?.gameId).toBe("relay");
    expect(findQuestionGameRunDefinition("dice")?.gameId).toBe("dice");
    expect(findQuestionGameRunDefinition("ladder")?.gameId).toBe("ladder");
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

  it.each([
    ["SOLO", 4],
    ["AI", 2],
  ] as const)("질문 사다리 %s 초기 상태에 세 라운드 사다리를 만든다", (mode, topicCount) => {
    const definition = findQuestionGameRunDefinition("ladder");
    expect(definition).toBeDefined();
    if (!definition) return;
    const topicHashes = Array.from(
      { length: topicCount },
      (_, index) => String(index + 1).repeat(64),
    );

    const state = definition.createState({
      mode,
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: topicCount,
      topicHashes,
    });

    definition.ensureProgress(state, {
      mode,
      runVersion: 1,
      activeRun: true,
    });
    expect(definition.publicProgress(state, mode)).toMatchObject({
      questionCount: 0,
      aiTurnCount: 0,
      awaitingAiTurn: false,
      targetCount: 3,
      ladderRound: 1,
    });
    const progress = definition.publicProgress(state, mode);
    expect(progress.ladderGrid).not.toBeNull();
    if (!progress.ladderGrid) return;
    expect(progress.ladderGrid).toHaveLength(10);
    expect(progress.ladderGrid.every((row) => row.length === topicCount - 1)).toBe(true);
  });

  it("질문 사다리 질문 수와 단계가 어긋난 상태를 거부한다", () => {
    const definition = findQuestionGameRunDefinition("ladder");
    expect(definition).toBeDefined();
    if (!definition) return;

    const state = definition.parseState({
      game: "ladder",
      locale: "ko",
      targetCount: 3,
      questionCount: 1,
      aiTurnCount: 0,
      activitySequence: 1,
      nextStep: "COMPLETE",
      topicHashes: ["1".repeat(64), "2".repeat(64), "3".repeat(64), "4".repeat(64)],
      grids: Array.from(
        { length: 3 },
        () => Array.from({ length: 10 }, () => [false, false, false]),
      ),
      questionHashes: ["a".repeat(64)],
    });

    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 2,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
  });

  it("질문 사다리 질문 수와 실행 버전이 어긋난 상태를 거부한다", () => {
    const definition = findQuestionGameRunDefinition("ladder");
    expect(definition).toBeDefined();
    if (!definition) return;
    const state = definition.createState({
      mode: "SOLO",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 4,
      topicHashes: ["1".repeat(64), "2".repeat(64), "3".repeat(64), "4".repeat(64)],
    });

    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 2,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
  });

  it("질문 사다리의 같은 질문 근거가 두 라운드에 저장된 상태를 거부한다", () => {
    const definition = findQuestionGameRunDefinition("ladder");
    expect(definition).toBeDefined();
    if (!definition) return;
    const initial = definition.createState({
      mode: "SOLO",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 4,
      topicHashes: ["1".repeat(64), "2".repeat(64), "3".repeat(64), "4".repeat(64)],
    }) as Record<string, unknown>;
    const duplicateHash = "a".repeat(64);
    const state = definition.parseState({
      ...initial,
      questionCount: 2,
      activitySequence: 2,
      questionHashes: [duplicateHash, duplicateHash],
    });

    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 3,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
  });

  it("진행 중인 질문 사다리 상태에 정산 결과가 들어 있으면 거부한다", () => {
    const definition = findQuestionGameRunDefinition("ladder");
    expect(definition).toBeDefined();
    if (!definition) return;
    const initial = definition.createState({
      mode: "SOLO",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 4,
      topicHashes: ["1".repeat(64), "2".repeat(64), "3".repeat(64), "4".repeat(64)],
    }) as Record<string, unknown>;
    const state = definition.parseState({
      ...initial,
      questionCount: 3,
      activitySequence: 3,
      nextStep: "COMPLETE",
      questionHashes: [],
      result: {
        awarded: 5,
        dailyLimit: 30,
        dailyRemaining: 25,
        cappedByLimit: false,
        preview: false,
      },
    });

    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 4,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 4,
      activeRun: false,
    })).not.toThrow();
  });
});
