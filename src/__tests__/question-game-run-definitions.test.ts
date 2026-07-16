import { describe, expect, it } from "vitest";
import { QuestionGameRunError } from "@/lib/question-game-run-definition";
import { findQuestionGameRunDefinition } from "@/lib/question-game-run-definitions";
import { KABA_SENTENCES } from "@/lib/question-game-i18n";
import {
  createStoryDiceRoll,
  createStoryDiceState,
} from "@/lib/question-game-story-dice-definition";

const TOPIC_HASH = "a".repeat(64);

describe("질문놀이 실행 정의", () => {
  it("지원하는 놀이의 상태 처리기를 찾는다", () => {
    expect(findQuestionGameRunDefinition("relay")?.gameId).toBe("relay");
    expect(findQuestionGameRunDefinition("dice")?.gameId).toBe("dice");
    expect(findQuestionGameRunDefinition("ladder")?.gameId).toBe("ladder");
    expect(findQuestionGameRunDefinition("kaba")?.gameId).toBe("kaba");
    expect(findQuestionGameRunDefinition("story-dice")?.gameId).toBe("story-dice");
    expect(findQuestionGameRunDefinition("memory")?.gameId).toBe("memory");
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

  it("질문 사다리는 만료나 자동 포기로 한 단계 오른 실행 버전만 허용한다", () => {
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
    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 1,
      activeRun: false,
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 2,
      activeRun: false,
    })).not.toThrow();
    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 3,
      activeRun: false,
    })).toThrowError(QuestionGameRunError);
  });

  it.each([
    ["ko", KABA_SENTENCES.ko],
    ["en", KABA_SENTENCES.en],
  ] as const)("까바놀이 %s 초기 상태에 서로 다른 서버 문장 열 개를 만든다", (locale, sentences) => {
    const definition = findQuestionGameRunDefinition("kaba");
    expect(definition).toBeDefined();
    if (!definition) return;

    const state = definition.createState({
      mode: "SOLO",
      locale,
      topicHash: TOPIC_HASH,
      topicLength: 0,
    }) as Record<string, unknown>;
    const sentencePlan = state.sentencePlan as string[];

    expect(sentencePlan).toHaveLength(10);
    expect(new Set(sentencePlan)).toHaveProperty("size", 10);
    expect(sentencePlan.every((key) => /^kaba-\d{2}$/.test(key))).toBe(true);
    definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 1,
      activeRun: true,
    });
    const progress = definition.publicProgress(state, "SOLO");
    expect(progress).toMatchObject({
      questionCount: 0,
      correctCount: 0,
      aiTurnCount: 0,
      awaitingAiTurn: false,
      targetCount: 10,
      kabaNextStep: "STUDENT_ATTEMPT",
    });
    expect(sentences).toContain(progress.currentSentence);
  });

  it("까바놀이의 문장 계획이 중복되거나 알 수 없는 키를 담으면 거부한다", () => {
    const definition = findQuestionGameRunDefinition("kaba");
    expect(definition).toBeDefined();
    if (!definition) return;
    const initial = definition.createState({
      mode: "SOLO",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 0,
    }) as Record<string, unknown>;
    const sentencePlan = initial.sentencePlan as string[];

    expect(() => definition.parseState({
      ...initial,
      sentencePlan: [sentencePlan[0], sentencePlan[0], ...sentencePlan.slice(2)],
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.parseState({
      ...initial,
      sentencePlan: ["kaba-99", ...sentencePlan.slice(1)],
    })).toThrowError(QuestionGameRunError);
  });

  it("까바놀이의 시도 수와 정답 수, 실행 버전, 다음 단계가 어긋나면 거부한다", () => {
    const definition = findQuestionGameRunDefinition("kaba");
    expect(definition).toBeDefined();
    if (!definition) return;
    const initial = definition.createState({
      mode: "AI",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 0,
    }) as Record<string, unknown>;
    const state = definition.parseState({
      ...initial,
      questionCount: 2,
      correctCount: 1,
      activitySequence: 2,
      questionHashes: ["a".repeat(64), "b".repeat(64)],
      kabaNextStep: "STUDENT_ATTEMPT",
    });

    expect(() => definition.ensureProgress(state, {
      mode: "AI",
      runVersion: 2,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.parseState({
      ...initial,
      questionCount: 1,
      correctCount: 2,
      activitySequence: 1,
      questionHashes: ["a".repeat(64)],
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.ensureProgress({
      ...(state as Record<string, unknown>),
      kabaNextStep: "COMPLETE",
    }, {
      mode: "AI",
      runVersion: 3,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
  });

  it("까바놀이는 만료나 자동 포기로 한 단계 오른 실행 버전만 허용한다", () => {
    const definition = findQuestionGameRunDefinition("kaba");
    expect(definition).toBeDefined();
    if (!definition) return;
    const state = definition.createState({
      mode: "SOLO",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 0,
    });

    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 2,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 1,
      activeRun: false,
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 2,
      activeRun: false,
    })).not.toThrow();
    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 3,
      activeRun: false,
    })).toThrowError(QuestionGameRunError);
  });

  it("이야기 주사위는 서버 단어를 여덟 개씩 준비하고 굴리기 단계만 공개한다", () => {
    const definition = findQuestionGameRunDefinition("story-dice");
    expect(definition).toBeDefined();
    if (!definition) return;
    const state = createStoryDiceState({
      mode: "SOLO",
      locale: "en",
      topicHash: TOPIC_HASH,
      topicLength: 0,
    }, () => 0);

    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 1,
      activeRun: true,
    })).not.toThrow();
    expect(definition.publicProgress(state, "SOLO")).toMatchObject({
      questionCount: 0,
      aiTurnCount: 0,
      awaitingAiTurn: false,
      targetCount: 3,
      storyDiceNextStep: "ROLL",
      storyRolledWords: null,
      storyWordPool: {
        protagonist: expect.arrayContaining([expect.any(String)]),
        place: expect.arrayContaining([expect.any(String)]),
        event: expect.arrayContaining([expect.any(String)]),
      },
    });
    const progress = definition.publicProgress(state, "SOLO");
    expect(progress.storyWordPool?.protagonist).toHaveLength(8);
    expect(progress.storyWordPool?.place).toHaveLength(8);
    expect(progress.storyWordPool?.event).toHaveLength(8);
  });

  it("이야기 주사위의 인공지능 질문과 학생 대답 차례를 실행 버전에 묶는다", () => {
    const definition = findQuestionGameRunDefinition("story-dice");
    expect(definition).toBeDefined();
    if (!definition) return;
    const initial = createStoryDiceState({
      mode: "AI",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 0,
    }, () => 0);
    const rolledWords = createStoryDiceRoll(initial.wordPlan, () => 0);
    const ready = {
      ...initial,
      rolledWords,
      storyHash: "a".repeat(64),
      storyLength: 20,
      activitySequence: 2,
      storyDiceNextStep: "AI_QUESTION" as const,
    };
    const awaitingAnswer = {
      ...ready,
      aiTurnCount: 1,
      activitySequence: 3,
      storyDiceNextStep: "STUDENT_ANSWER" as const,
      pendingQuestionHash: "b".repeat(64),
      questionHashes: ["b".repeat(64)],
    };
    const answered = {
      ...ready,
      questionCount: 1,
      aiTurnCount: 1,
      activitySequence: 4,
      answerHashes: ["c".repeat(64)],
      questionHashes: ["b".repeat(64)],
    };

    expect(() => definition.ensureProgress(ready, {
      mode: "AI",
      runVersion: 3,
      activeRun: true,
    })).not.toThrow();
    expect(() => definition.ensureProgress(awaitingAnswer, {
      mode: "AI",
      runVersion: 4,
      activeRun: true,
    })).not.toThrow();
    expect(() => definition.ensureProgress(answered, {
      mode: "AI",
      runVersion: 5,
      activeRun: true,
    })).not.toThrow();
    expect(() => definition.ensureProgress(answered, {
      mode: "AI",
      runVersion: 4,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.ensureProgress(ready, {
      mode: "SOLO",
      runVersion: 3,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
  });

  it("이야기 주사위 완료 상태는 입력 해시를 지우고 세 쌍과 세 인공지능 질문만 인정한다", () => {
    const definition = findQuestionGameRunDefinition("story-dice");
    expect(definition).toBeDefined();
    if (!definition) return;
    const initial = createStoryDiceState({
      mode: "AI",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 0,
    }, () => 0);
    const settled = {
      ...initial,
      rolledWords: createStoryDiceRoll(initial.wordPlan, () => 0),
      questionCount: 3,
      aiTurnCount: 3,
      activitySequence: 8,
      storyDiceNextStep: "COMPLETE" as const,
      result: {
        awarded: 9,
        dailyLimit: 50,
        dailyRemaining: 41,
        cappedByLimit: false,
        preview: false,
      },
    };

    expect(() => definition.ensureProgress(settled, {
      mode: "AI",
      runVersion: 9,
      activeRun: false,
    })).not.toThrow();
    expect(() => definition.ensureProgress({ ...settled, aiTurnCount: 2 }, {
      mode: "AI",
      runVersion: 9,
      activeRun: false,
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.parseState(JSON.parse(JSON.stringify({
      ...initial,
      wordPlan: {
        ...initial.wordPlan,
        protagonist: [
          initial.wordPlan.protagonist[0],
          initial.wordPlan.protagonist[0],
          ...initial.wordPlan.protagonist.slice(2),
        ],
      },
    })))).toThrowError(QuestionGameRunError);
  });

  it("이야기 주사위는 만료나 자동 포기로 한 단계 오른 실행 버전만 허용한다", () => {
    const definition = findQuestionGameRunDefinition("story-dice");
    expect(definition).toBeDefined();
    if (!definition) return;
    const state = createStoryDiceState({
      mode: "SOLO",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 0,
    }, () => 0);

    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 2,
      activeRun: false,
    })).not.toThrow();
    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 1,
      activeRun: false,
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.ensureProgress(state, {
      mode: "SOLO",
      runVersion: 3,
      activeRun: false,
    })).toThrowError(QuestionGameRunError);
  });

  it.each([
    ["easy", 6, 18],
    ["normal", 10, 30],
    ["hard", 15, 45],
  ] as const)(
    "카드 짝 찾기 %s 초기 상태는 숨은 카드와 최대 시도만 공개한다",
    (difficulty, pairCount, targetCount) => {
      const definition = findQuestionGameRunDefinition("memory");
      expect(definition).toBeDefined();
      if (!definition) return;
      const state = definition.createState({
        mode: "AI",
        locale: "ko",
        topicHash: TOPIC_HASH,
        topicLength: 0,
        difficulty,
      });

      expect(() => definition.ensureProgress(state, {
        mode: "AI",
        runVersion: 1,
        activeRun: true,
      })).not.toThrow();
      const progress = definition.publicProgress(state, "AI");
      expect(progress).toMatchObject({
        questionCount: 0,
        aiTurnCount: 0,
        awaitingAiTurn: false,
        targetCount,
        memoryDifficulty: difficulty,
        memoryNextStep: "STUDENT_QUESTION",
        studentMatchCount: 0,
        aiMatchCount: 0,
        memoryMissReveal: null,
        memoryReview: null,
      });
      expect(progress.memoryQuestionCards).toHaveLength(pairCount);
      expect(progress.memoryAnswerCards).toHaveLength(pairCount);
      expect(progress.memoryQuestionCards).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "q", state: "HIDDEN" }),
      ]));
      expect(progress.memoryAnswerCards).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "a", state: "HIDDEN" }),
      ]));
      expect(JSON.stringify(progress)).not.toContain("pairKey");
      expect(JSON.stringify(progress)).not.toContain("contentKey");
      expect(new Set([
        ...(progress.memoryQuestionCards ?? []).map(({ id }) => id),
        ...(progress.memoryAnswerCards ?? []).map(({ id }) => id),
      ]).size).toBe(pairCount * 2);
    },
  );

  it("카드 짝 찾기는 공개하거나 얻은 카드에만 고정 자료 키를 공개한다", () => {
    const definition = findQuestionGameRunDefinition("memory");
    expect(definition).toBeDefined();
    if (!definition) return;
    const initial = definition.createState({
      mode: "SOLO",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 0,
      difficulty: "easy",
    }) as {
      qCards: Array<{ id: string; pairKey: string; type: "q" }>;
      pairs: Array<{ pairKey: string; contentKey: string }>;
      seenCardIds: string[];
      revealedIds: string[];
      activitySequence: number;
      memoryNextStep: string;
    };
    const card = initial.qCards[0];
    const pair = initial.pairs.find(({ pairKey }) => pairKey === card.pairKey);
    const revealed = {
      ...initial,
      seenCardIds: [card.id],
      revealedIds: [card.id],
      activitySequence: 1,
      memoryNextStep: "STUDENT_ANSWER",
    };

    expect(() => definition.ensureProgress(revealed, {
      mode: "SOLO",
      runVersion: 2,
      activeRun: true,
    })).not.toThrow();
    const progress = definition.publicProgress(revealed, "SOLO");
    expect(progress.memoryQuestionCards?.find(({ id }) => id === card.id)).toEqual({
      id: card.id,
      type: "q",
      state: "REVEALED",
      contentKey: pair?.contentKey,
    });
    expect(progress.memoryAnswerCards?.every((item) =>
      item.state === "HIDDEN" && !("contentKey" in item)
    )).toBe(true);
    expect(JSON.stringify(progress)).not.toContain("pairKey");
  });

  it("카드 짝 찾기 완료 상태는 모든 고정 자료 키를 검토 목록에 공개한다", () => {
    const definition = findQuestionGameRunDefinition("memory");
    expect(definition).toBeDefined();
    if (!definition) return;
    const initial = definition.createState({
      mode: "SOLO",
      locale: "en",
      topicHash: TOPIC_HASH,
      topicLength: 0,
      difficulty: "easy",
    }) as {
      qCards: Array<{ id: string }>;
      aCards: Array<{ id: string }>;
      pairs: Array<{ contentKey: string }>;
      [key: string]: unknown;
    };
    const allCardIds = [
      ...initial.qCards.map(({ id }) => id),
      ...initial.aCards.map(({ id }) => id),
    ];
    const settled = {
      ...initial,
      questionCount: 6,
      activitySequence: 12,
      studentMatchCount: 6,
      takenIds: allCardIds,
      seenCardIds: allCardIds,
      memoryNextStep: "COMPLETE",
      result: {
        awarded: 8,
        dailyLimit: 30,
        dailyRemaining: 22,
        cappedByLimit: false,
        preview: false,
      },
    };

    expect(() => definition.ensureProgress(settled, {
      mode: "SOLO",
      runVersion: 13,
      activeRun: false,
    })).not.toThrow();
    const progress = definition.publicProgress(settled, "SOLO");
    expect(progress.memoryReview).toEqual(
      initial.pairs.map(({ contentKey }) => ({ contentKey })),
    );
    expect([
      ...(progress.memoryQuestionCards ?? []),
      ...(progress.memoryAnswerCards ?? []),
    ].every((card) => card.state === "TAKEN" && "contentKey" in card)).toBe(true);
  });

  it("카드 짝 찾기는 중복 카드 식별값과 틀린 실행 버전을 거부한다", () => {
    const definition = findQuestionGameRunDefinition("memory");
    expect(definition).toBeDefined();
    if (!definition) return;
    const initial = definition.createState({
      mode: "AI",
      locale: "ko",
      topicHash: TOPIC_HASH,
      topicLength: 0,
      difficulty: "easy",
    }) as {
      qCards: Array<{ id: string; pairKey: string; type: "q" }>;
      aCards: Array<{ id: string; pairKey: string; type: "a" }>;
      [key: string]: unknown;
    };
    const damaged = JSON.parse(JSON.stringify({
      ...initial,
      aCards: [
        { ...initial.aCards[0], id: initial.qCards[0].id },
        ...initial.aCards.slice(1),
      ],
    }));

    expect(() => definition.parseState(damaged)).toThrowError(QuestionGameRunError);
    expect(() => definition.ensureProgress(initial, {
      mode: "AI",
      runVersion: 2,
      activeRun: true,
    })).toThrowError(QuestionGameRunError);
    expect(() => definition.ensureProgress(initial, {
      mode: "AI",
      runVersion: 2,
      activeRun: false,
    })).not.toThrow();
  });
});
